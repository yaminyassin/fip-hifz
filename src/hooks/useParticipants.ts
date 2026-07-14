import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot, query, QuerySnapshot, DocumentData } from "firebase/firestore";
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
import { buildDefaultAdjustmentValues } from "@/evaluation/configHelpers";
import {
  EVALUATION_SCORES_COLLECTION,
  JURY_EVALUATION_INPUTS_COLLECTION,
} from "@/services/evaluationScores";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";

/**
 * Config-driven participant scoring (design doc §4, "Consumer wiring"):
 * feeds the V2 `evaluationScores`/`juryEvaluationInputs` collections
 * through `scoreQuestion` → `scoreJury` → `scoreParticipant` from the
 * committed engine, instead of recomputing caps/penalties in the consumer.
 * `finalScore` is the ranking-eligibility sentinel: `-1` unless
 * `isDone && juryResults` has at least one complete jury evaluation.
 */
export type ParticipantWithScores = Participant & {
  /** -1 when the participant is not ranking-eligible (not done, or no
   * complete jury evaluation yet) — the sentinel every consumer already
   * checks for before rendering a score. */
  finalScore: number;
  /** Per-jury results, keyed by juryId, for every jury whose evaluation is
   * complete and valid against the current config. A jury with a missing,
   * duplicate, or invalid question is simply absent here (incomplete
   * evaluations never contribute a value). */
  juryResults: Record<string, JuryScoreResult>;
  juryIds: string[];
  /** Set when the participant's category is not present in
   * `config.categories` — surfaced as an explicit error, never a silent
   * drop or a fallback to category 'A'. */
  scoringError?: string;
};

interface RawEvaluationScoreDoc {
  participantId: string;
  juryId: string;
  questionNumber: number;
  values: QuestionValueMap;
}

interface RawJuryEvaluationInputsDoc {
  participantId: string;
  juryId: string;
  values: AdjustmentValueMap;
}

function computeParticipantScoring(
  participant: Participant,
  scoreDocs: readonly RawEvaluationScoreDoc[],
  adjustmentDocs: readonly RawJuryEvaluationInputsDoc[],
  config: EventEvaluationConfigV2
): Pick<ParticipantWithScores, "finalScore" | "juryResults" | "juryIds" | "scoringError"> {
  const category = config.categories[participant.category];
  if (!category) {
    return {
      finalScore: -1,
      juryResults: {},
      juryIds: [],
      scoringError: `category "${participant.category}" is not defined in this event's config`,
    };
  }

  const assignedQuestionNumbers = Array.from(
    { length: category.questionCount },
    (_, i) => i + 1
  );

  const questionValuesByJury = new Map<string, Map<number, QuestionValueMap>>();
  for (const scoreDoc of scoreDocs) {
    if (scoreDoc.participantId !== participant.id) continue;
    const juryMap = questionValuesByJury.get(scoreDoc.juryId) ?? new Map();
    juryMap.set(scoreDoc.questionNumber, scoreDoc.values);
    questionValuesByJury.set(scoreDoc.juryId, juryMap);
  }

  const adjustmentValuesByJury = new Map<string, AdjustmentValueMap>();
  for (const adjustmentDoc of adjustmentDocs) {
    if (adjustmentDoc.participantId !== participant.id) continue;
    adjustmentValuesByJury.set(adjustmentDoc.juryId, adjustmentDoc.values);
  }

  const juryIdsWithAnyData = new Set([
    ...questionValuesByJury.keys(),
    ...adjustmentValuesByJury.keys(),
  ]);

  const juryResults: Record<string, JuryScoreResult> = {};
  for (const juryId of juryIdsWithAnyData) {
    const questionValues = questionValuesByJury.get(juryId) ?? new Map();
    // A jury with no adjustment doc yet simply has no bonus/deduction applied
    // (defaults to the config's zero/min values) — that is not the same as
    // an incomplete evaluation, which is specifically a missing/invalid
    // *question* score.
    const adjustmentValues =
      adjustmentValuesByJury.get(juryId) ?? buildDefaultAdjustmentValues(config);

    const result = scoreJury(config, assignedQuestionNumbers, questionValues, adjustmentValues);
    if (result.ok) {
      juryResults[juryId] = result.value;
    }
    // An incomplete/invalid jury evaluation simply doesn't contribute —
    // per the `incompleteEvaluation` policy, no final score for that jury.
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
  };
}

export const useParticipants = () => {
  const queryClient = useQueryClient();
  const { currentEvent, evaluationConfig } = useEvent();

  const participantsRef = useRef<Participant[]>([]);
  const scoreDocsRef = useRef<RawEvaluationScoreDoc[]>([]);
  const adjustmentDocsRef = useRef<RawJuryEvaluationInputsDoc[]>([]);
  const configRef = useRef<EventEvaluationConfigV2 | null>(evaluationConfig);
  configRef.current = evaluationConfig;

  const recompute = () => {
    const config = configRef.current;
    const participants = participantsRef.current;
    if (!config) {
      // Config not ready yet: expose participants with the ranking-ineligible
      // sentinel rather than any computed score.
      const withSentinel: ParticipantWithScores[] = participants.map((p) => ({
        ...p,
        finalScore: -1,
        juryResults: {},
        juryIds: [],
      }));
      queryClient.setQueryData(["participants", currentEvent], withSentinel);
      return;
    }

    const updated: ParticipantWithScores[] = participants.map((participant) => ({
      ...participant,
      ...computeParticipantScoring(
        participant,
        scoreDocsRef.current,
        adjustmentDocsRef.current,
        config
      ),
    }));
    queryClient.setQueryData(["participants", currentEvent], updated);
  };

  useEffect(() => {
    if (!currentEvent) return;

    const participantsCollection = collection(
      firestore,
      getEventCollectionPath(currentEvent, "participants")
    );
    const participantsUnsubscribe = onSnapshot(
      participantsCollection,
      (snapshot) => {
        participantsRef.current = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Participant, "id">),
        }));
        recompute();
      },
      (error) => console.error("Error in participants listener:", error)
    );

    const scoresRef = collection(
      firestore,
      getEventCollectionPath(currentEvent, EVALUATION_SCORES_COLLECTION)
    );
    const scoresUnsubscribe = onSnapshot(
      query(scoresRef),
      (snapshot: QuerySnapshot<DocumentData>) => {
        scoreDocsRef.current = snapshot.docs.map((d) => d.data() as RawEvaluationScoreDoc);
        recompute();
      },
      (error) => console.error("Error in evaluation scores listener:", error)
    );

    const adjustmentsRef = collection(
      firestore,
      getEventCollectionPath(currentEvent, JURY_EVALUATION_INPUTS_COLLECTION)
    );
    const adjustmentsUnsubscribe = onSnapshot(
      query(adjustmentsRef),
      (snapshot: QuerySnapshot<DocumentData>) => {
        adjustmentDocsRef.current = snapshot.docs.map(
          (d) => d.data() as RawJuryEvaluationInputsDoc
        );
        recompute();
      },
      (error) => console.error("Error in jury evaluation inputs listener:", error)
    );

    return () => {
      participantsUnsubscribe();
      scoresUnsubscribe();
      adjustmentsUnsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, currentEvent]);

  // Recompute whenever the config itself resolves/changes (e.g. transitions
  // from null -> ready shortly after participants/scores already loaded).
  useEffect(() => {
    recompute();
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
