import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot, query, Timestamp } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useEffect, useRef } from "react";
import { useEvent } from "@/contexts/EventContext";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import {
  scoreJury,
  scoreParticipant,
  type JuryScoreResult,
  type QuestionValueMap,
  type AdjustmentValueMap,
} from "@/evaluation/scoringEngine";
import {
  buildDefaultAdjustmentValues,
  computeAssignmentHash,
} from "@/evaluation/configHelpers";
import {
  EVALUATION_SCORES_COLLECTION,
  JURY_EVALUATION_INPUTS_COLLECTION,
} from "@/services/evaluationScores";
import type {
  EvaluationScoreV2,
  EventEvaluationConfigV2,
  JuryEvaluationInputsV2,
  NativeV2Source,
} from "@/evaluation/types";

/**
 * Config-driven participant scoring (design doc §4, "Consumer wiring"):
 * feeds the V2 `evaluationScores`/`juryEvaluationInputs` collections
 * through `scoreQuestion` → `scoreJury` → `scoreParticipant` from the
 * committed engine, instead of recomputing caps/penalties in the consumer.
 * `finalScore` is the ranking-eligibility sentinel: `-1` unless
 * `isDone && juryResults` has at least one complete jury evaluation.
 */
export type ParticipantWithScores = Participant & {
  finalScore: number;
  juryResults: Record<string, JuryScoreResult>;
  juryIds: string[];
  scoringError?: string;
};

export type RawEvaluationScoreDoc = Omit<EvaluationScoreV2, "source"> & {
  source: NativeV2Source;
};

export type RawJuryEvaluationInputsDoc = Omit<JuryEvaluationInputsV2, "source"> & {
  source: NativeV2Source;
};

type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; participantId?: string; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    actualKeys.every((key) => expectedKeys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNestedNumberMap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (inputs) => isRecord(inputs) &&
      Object.values(inputs).every((input) => typeof input === "number" && Number.isFinite(input))
  );
}

function invalidDocument<T>(
  kind: string,
  data: Record<string, unknown> | null,
  detail: string
): DecodeResult<T> {
  return {
    ok: false,
    participantId: data && typeof data.participantId === "string"
      ? data.participantId
      : undefined,
    error: `invalid ${kind} document: ${detail}`,
  };
}

const SCORE_DOCUMENT_KEYS = [
  "schemaVersion",
  "participantId",
  "juryId",
  "questionNumber",
  "pageNumber",
  "categoryId",
  "configVersion",
  "scoringFingerprint",
  "algorithmVersion",
  "assignmentHash",
  "values",
  "source",
  "createdAt",
  "updatedAt",
] as const;

const ADJUSTMENT_DOCUMENT_KEYS = [
  "schemaVersion",
  "participantId",
  "juryId",
  "categoryId",
  "configVersion",
  "scoringFingerprint",
  "algorithmVersion",
  "assignmentHash",
  "values",
  "source",
  "createdAt",
  "updatedAt",
] as const;

function hasValidCommonBoundary(data: Record<string, unknown>): boolean {
  return isNonEmptyString(data.participantId) &&
    isNonEmptyString(data.juryId) &&
    isNonEmptyString(data.categoryId) &&
    isNonEmptyString(data.configVersion) &&
    isNonEmptyString(data.scoringFingerprint) &&
    (data.algorithmVersion === "legacy-lisbon-display-v1" ||
      data.algorithmVersion === "jury-first-v2") &&
    isNonEmptyString(data.assignmentHash) &&
    data.createdAt instanceof Timestamp &&
    data.updatedAt instanceof Timestamp;
}

function hasGreenfieldSource(data: Record<string, unknown>): boolean {
  return isRecord(data.source) &&
    hasExactKeys(data.source, ["kind"]) &&
    data.source.kind === "nativeV2";
}

function decodeEvaluationScoreDoc(data: unknown): DecodeResult<RawEvaluationScoreDoc> {
  const record = isRecord(data) ? data : null;
  if (!record) return invalidDocument("evaluation score", null, "expected an object");
  if (!hasExactKeys(record, SCORE_DOCUMENT_KEYS)) {
    return invalidDocument("evaluation score", record, "fields do not match the V2 boundary");
  }
  if (record.schemaVersion !== 2) {
    return invalidDocument("evaluation score", record, "schemaVersion must be 2");
  }
  if (!hasGreenfieldSource(record)) {
    return invalidDocument("evaluation score", record, "source.kind must be nativeV2");
  }
  if (!hasValidCommonBoundary(record)) {
    return invalidDocument("evaluation score", record, "missing or invalid provenance/timestamp fields");
  }
  if (!Number.isInteger(record.questionNumber) || !Number.isInteger(record.pageNumber)) {
    return invalidDocument("evaluation score", record, "questionNumber and pageNumber must be integers");
  }
  if (!isNestedNumberMap(record.values)) {
    return invalidDocument("evaluation score", record, "values must be a nested finite-number map");
  }
  return { ok: true, value: record as unknown as RawEvaluationScoreDoc };
}

function decodeJuryEvaluationInputsDoc(
  data: unknown
): DecodeResult<RawJuryEvaluationInputsDoc> {
  const record = isRecord(data) ? data : null;
  if (!record) return invalidDocument("jury evaluation inputs", null, "expected an object");
  if (!hasExactKeys(record, ADJUSTMENT_DOCUMENT_KEYS)) {
    return invalidDocument("jury evaluation inputs", record, "fields do not match the V2 boundary");
  }
  if (record.schemaVersion !== 2) {
    return invalidDocument("jury evaluation inputs", record, "schemaVersion must be 2");
  }
  if (!hasGreenfieldSource(record)) {
    return invalidDocument("jury evaluation inputs", record, "source.kind must be nativeV2");
  }
  if (!hasValidCommonBoundary(record)) {
    return invalidDocument(
      "jury evaluation inputs",
      record,
      "missing or invalid provenance/timestamp fields"
    );
  }
  if (!isNestedNumberMap(record.values)) {
    return invalidDocument(
      "jury evaluation inputs",
      record,
      "values must be a nested finite-number map"
    );
  }
  return { ok: true, value: record as unknown as RawJuryEvaluationInputsDoc };
}

function hasCurrentProvenance(
  document: RawEvaluationScoreDoc | RawJuryEvaluationInputsDoc,
  participant: Participant,
  config: EventEvaluationConfigV2,
  assignmentHash: string
): boolean {
  return document.participantId === participant.id &&
    document.categoryId === participant.category &&
    document.configVersion === config.configVersion &&
    document.scoringFingerprint === config.scoringFingerprint &&
    document.algorithmVersion === config.algorithmVersion &&
    document.assignmentHash === assignmentHash;
}

function scoringFailure(error: string) {
  return {
    finalScore: -1,
    juryResults: {},
    juryIds: [],
    scoringError: error,
  };
}

function groupByLogicalKey<T>(
  documents: readonly T[],
  keyOf: (document: T) => string
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const document of documents) {
    const key = keyOf(document);
    const group = groups.get(key) ?? [];
    group.push(document);
    groups.set(key, group);
  }
  return groups;
}

export async function computeParticipantScoring(
  participant: Participant,
  scoreDocs: readonly unknown[],
  adjustmentDocs: readonly unknown[],
  config: EventEvaluationConfigV2
): Promise<Pick<ParticipantWithScores, "finalScore" | "juryResults" | "juryIds" | "scoringError">> {
  const category = config.categories[participant.category];
  if (!category) {
    return scoringFailure(
      `category "${participant.category}" is not defined in this event's config`
    );
  }

  const assignedQuestionNumbers = Array.from(
    { length: category.questionCount },
    (_, i) => i + 1
  );
  const assignmentHash = await computeAssignmentHash(
    participant.id,
    participant.category,
    participant.assignedQuestions
  );

  const currentScoreDocs: RawEvaluationScoreDoc[] = [];
  for (const rawDocument of scoreDocs) {
    const decoded = decodeEvaluationScoreDoc(rawDocument);
    if (!decoded.ok) {
      if (!decoded.participantId || decoded.participantId === participant.id) {
        return scoringFailure(decoded.error);
      }
      continue;
    }
    const scoreDoc = decoded.value;
    if (!hasCurrentProvenance(scoreDoc, participant, config, assignmentHash)) continue;
    if (scoreDoc.questionNumber < 1 || scoreDoc.questionNumber > category.questionCount) {
      return scoringFailure(
        `invalid evaluation score document: questionNumber ${scoreDoc.questionNumber} is outside category range 1-${category.questionCount}`
      );
    }
    const assignedPage = participant.assignedQuestions[scoreDoc.questionNumber - 1];
    if (scoreDoc.pageNumber !== assignedPage) {
      return scoringFailure(
        `invalid evaluation score document: pageNumber ${scoreDoc.pageNumber} does not match assigned page ${String(assignedPage)} for question ${scoreDoc.questionNumber}`
      );
    }
    currentScoreDocs.push(scoreDoc);
  }

  const currentAdjustmentDocs: RawJuryEvaluationInputsDoc[] = [];
  for (const rawDocument of adjustmentDocs) {
    const decoded = decodeJuryEvaluationInputsDoc(rawDocument);
    if (!decoded.ok) {
      if (!decoded.participantId || decoded.participantId === participant.id) {
        return scoringFailure(decoded.error);
      }
      continue;
    }
    if (hasCurrentProvenance(decoded.value, participant, config, assignmentHash)) {
      currentAdjustmentDocs.push(decoded.value);
    }
  }

  const scoreGroups = groupByLogicalKey(
    currentScoreDocs,
    (document) => JSON.stringify([document.juryId, document.questionNumber])
  );
  for (const documents of scoreGroups.values()) {
    if (documents.length > 1) {
      const duplicate = documents[0];
      return scoringFailure(
        `duplicate evaluation score documents for jury "${duplicate.juryId}", question ${duplicate.questionNumber}`
      );
    }
  }

  const adjustmentGroups = groupByLogicalKey(
    currentAdjustmentDocs,
    (document) => document.juryId
  );
  for (const [juryId, documents] of adjustmentGroups) {
    if (documents.length > 1) {
      return scoringFailure(
        `duplicate jury evaluation input documents for jury "${juryId}"`
      );
    }
  }

  const questionValuesByJury = new Map<string, Map<number, QuestionValueMap>>();
  for (const documents of scoreGroups.values()) {
    const scoreDoc = documents[0];
    const juryMap = questionValuesByJury.get(scoreDoc.juryId) ?? new Map();
    juryMap.set(scoreDoc.questionNumber, scoreDoc.values);
    questionValuesByJury.set(scoreDoc.juryId, juryMap);
  }

  const adjustmentValuesByJury = new Map<string, AdjustmentValueMap>();
  for (const documents of adjustmentGroups.values()) {
    const adjustmentDoc = documents[0];
    adjustmentValuesByJury.set(adjustmentDoc.juryId, adjustmentDoc.values);
  }

  const juryIdsWithAnyData = new Set([
    ...questionValuesByJury.keys(),
    ...adjustmentValuesByJury.keys(),
  ]);

  const juryResults: Record<string, JuryScoreResult> = {};
  for (const juryId of juryIdsWithAnyData) {
    const questionValues = questionValuesByJury.get(juryId) ?? new Map();
    const adjustmentValues =
      adjustmentValuesByJury.get(juryId) ?? buildDefaultAdjustmentValues(config);

    // A jury that has not yet scored every assigned question is still in
    // progress: omit it (eligibility only needs one complete jury). But a jury
    // that HAS every question and still fails the engine is semantically
    // invalid, not incomplete — fail closed rather than silently drop it.
    const hasEveryQuestion = assignedQuestionNumbers.every((q) => questionValues.has(q));
    if (!hasEveryQuestion) continue;

    const result = scoreJury(config, assignedQuestionNumbers, questionValues, adjustmentValues);
    if (!result.ok) {
      return scoringFailure(
        `invalid evaluation for jury "${juryId}": ${result.errors.join("; ")}`
      );
    }
    juryResults[juryId] = result.value;
  }

  const juryIds = Object.keys(juryResults).sort();
  if (!participant.isDone || juryIds.length === 0) {
    return { finalScore: -1, juryResults, juryIds };
  }

  const juryResultsMap = new Map(juryIds.map((id) => [id, juryResults[id]]));
  const aggregate = scoreParticipant(juryResultsMap);
  return {
    finalScore: aggregate.ok ? aggregate.value : -1,
    juryResults,
    juryIds,
    ...(!aggregate.ok && { scoringError: aggregate.errors.join("; ") }),
  };
}

interface EventGeneration {
  eventId: string | null;
  generation: number;
}

const LISTENER_ERROR_KEY = "participantsListenerError";

export const useParticipants = () => {
  const queryClient = useQueryClient();
  const { currentEvent, evaluationConfig } = useEvent();

  const participantsRef = useRef<Participant[]>([]);
  const scoreDocsRef = useRef<unknown[]>([]);
  const adjustmentDocsRef = useRef<unknown[]>([]);
  const configRef = useRef<EventEvaluationConfigV2 | null>(evaluationConfig);
  const recomputeVersionRef = useRef(0);
  // Each of the three collections must deliver its first snapshot before any
  // ranking is published, so a participant is never scored with a half-loaded
  // score/adjustment set (e.g. default bonuses before jury inputs arrive).
  const listenersReadyRef = useRef({
    participants: false,
    scores: false,
    adjustments: false,
  });
  const eventGenerationRef = useRef<EventGeneration>({
    eventId: currentEvent,
    generation: 0,
  });

  if (eventGenerationRef.current.eventId !== currentEvent) {
    eventGenerationRef.current = {
      eventId: currentEvent,
      generation: eventGenerationRef.current.generation + 1,
    };
    participantsRef.current = [];
    scoreDocsRef.current = [];
    adjustmentDocsRef.current = [];
    listenersReadyRef.current = { participants: false, scores: false, adjustments: false };
    recomputeVersionRef.current += 1;
  }
  configRef.current = evaluationConfig;

  const isCurrentGeneration = (eventId: string, generation: number) =>
    eventGenerationRef.current.eventId === eventId &&
    eventGenerationRef.current.generation === generation;

  const recompute = async (eventId = currentEvent, generation = eventGenerationRef.current.generation) => {
    if (!eventId || !isCurrentGeneration(eventId, generation)) return;
    const ready = listenersReadyRef.current;
    if (!ready.participants || !ready.scores || !ready.adjustments) return;
    const recomputeVersion = ++recomputeVersionRef.current;
    const config = configRef.current;
    const participants = participantsRef.current;
    const scoreDocs = scoreDocsRef.current;
    const adjustmentDocs = adjustmentDocsRef.current;

    if (!config) {
      const withSentinel: ParticipantWithScores[] = participants.map((p) => ({
        ...p,
        finalScore: -1,
        juryResults: {},
        juryIds: [],
      }));
      if (isCurrentGeneration(eventId, generation) &&
        recomputeVersion === recomputeVersionRef.current) {
        queryClient.setQueryData(["participants", eventId], withSentinel);
      }
      return;
    }

    const updated: ParticipantWithScores[] = await Promise.all(
      participants.map(async (participant) => ({
        ...participant,
        ...await computeParticipantScoring(participant, scoreDocs, adjustmentDocs, config),
      }))
    );
    if (isCurrentGeneration(eventId, generation) &&
      recomputeVersion === recomputeVersionRef.current) {
      queryClient.setQueryData(["participants", eventId], updated);
    }
  };

  useEffect(() => {
    if (!currentEvent) return;
    const eventId = currentEvent;
    const generation = eventGenerationRef.current.generation;

    // Fresh listeners for this event: clear any prior disconnect error.
    queryClient.setQueryData([LISTENER_ERROR_KEY, eventId], null);

    const participantsCollection = collection(
      firestore,
      getEventCollectionPath(eventId, "participants")
    );
    const participantsUnsubscribe = onSnapshot(
      participantsCollection,
      (snapshot) => {
        if (!isCurrentGeneration(eventId, generation)) return;
        participantsRef.current = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Participant, "id">),
        }));
        listenersReadyRef.current.participants = true;
        void recompute(eventId, generation);
      },
      (error) => {
        console.error("Error in participants listener:", error);
        queryClient.setQueryData(
          [LISTENER_ERROR_KEY, eventId],
          error?.message ?? "participants listener error"
        );
      }
    );

    const scoresRef = collection(
      firestore,
      getEventCollectionPath(eventId, EVALUATION_SCORES_COLLECTION)
    );
    const scoresUnsubscribe = onSnapshot(
      query(scoresRef),
      (snapshot) => {
        if (!isCurrentGeneration(eventId, generation)) return;
        scoreDocsRef.current = snapshot.docs.map((document) => document.data());
        listenersReadyRef.current.scores = true;
        void recompute(eventId, generation);
      },
      (error) => {
        console.error("Error in evaluation scores listener:", error);
        queryClient.setQueryData(
          [LISTENER_ERROR_KEY, eventId],
          error?.message ?? "evaluation scores listener error"
        );
      }
    );

    const adjustmentsRef = collection(
      firestore,
      getEventCollectionPath(eventId, JURY_EVALUATION_INPUTS_COLLECTION)
    );
    const adjustmentsUnsubscribe = onSnapshot(
      query(adjustmentsRef),
      (snapshot) => {
        if (!isCurrentGeneration(eventId, generation)) return;
        adjustmentDocsRef.current = snapshot.docs.map((document) => document.data());
        listenersReadyRef.current.adjustments = true;
        void recompute(eventId, generation);
      },
      (error) => {
        console.error("Error in jury evaluation inputs listener:", error);
        queryClient.setQueryData(
          [LISTENER_ERROR_KEY, eventId],
          error?.message ?? "jury evaluation inputs listener error"
        );
      }
    );

    return () => {
      participantsUnsubscribe();
      scoresUnsubscribe();
      adjustmentsUnsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, currentEvent]);

  useEffect(() => {
    void recompute(currentEvent, eventGenerationRef.current.generation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationConfig]);

  return useQuery<ParticipantWithScores[]>({
    queryKey: ["participants", currentEvent],
    queryFn: () => (queryClient.getQueryData(["participants", currentEvent]) as ParticipantWithScores[]) || [],
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!currentEvent,
  });
};

/**
 * The message of the last Firestore listener error for the current event, or
 * null. A Firestore `onSnapshot` error is terminal — the listener stops
 * delivering — so once this is set the ranking data is frozen until the page
 * reloads (which re-establishes fresh listeners). Consumers show a "live
 * updates disconnected" surface so an operator never trusts stale scores.
 */
export function useParticipantsListenerError(): string | null {
  const { currentEvent } = useEvent();
  const queryClient = useQueryClient();
  const { data } = useQuery<string | null>({
    queryKey: [LISTENER_ERROR_KEY, currentEvent],
    queryFn: () =>
      (queryClient.getQueryData([LISTENER_ERROR_KEY, currentEvent]) as string | null) ?? null,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!currentEvent,
  });
  return data ?? null;
}
