import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { firestore } from "@/main";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import {
  validateAdjustmentValues,
  validateQuestionValues,
  type AdjustmentValueMap,
  type QuestionValueMap,
} from "@/evaluation/scoringEngine";
import { computeAssignmentHash } from "@/evaluation/configHelpers";
import { canonicalStringify, sha256Hex } from "@/evaluation/configHash";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";

/** Maximum operations Firestore accepts in a single batched write. */
const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Firestore access for the V2 score/adjustment collections (design doc §4,
 * "Consumer wiring"): one representation, no legacy `scores`/`overallBonuses`
 * collections. `events/{eventId}/evaluationScores/{id}` stores one
 * `EvaluationScoreV2` per (participant, jury, question);
 * `events/{eventId}/juryEvaluationInputs/{id}` stores one
 * `JuryEvaluationInputsV2` per (participant, jury) with the participant-level
 * adjustment values (e.g. the overall bonus).
 */

export const EVALUATION_SCORES_COLLECTION = "evaluationScores";
export const JURY_EVALUATION_INPUTS_COLLECTION = "juryEvaluationInputs";

/** Document IDs are a bounded, injective hash of the full logical key rather
 * than raw concatenation: `("a_b","c",1)` and `("a","b_c",1)` must not collide
 * onto one document, and a long jury id must not overflow Firestore's
 * 1500-byte id limit. The identifying fields are still stored on the document. */
export function evaluationScoreDocId(
  participantId: string,
  juryId: string,
  questionNumber: number
): Promise<string> {
  return sha256Hex(canonicalStringify({ participantId, juryId, questionNumber }));
}

export function juryEvaluationInputsDocId(
  participantId: string,
  juryId: string
): Promise<string> {
  return sha256Hex(canonicalStringify({ participantId, juryId }));
}

interface EvaluationWriteExpectation {
  categoryId: string;
  assignedQuestions: readonly number[];
  question?: {
    number: number;
    pageNumber: number;
  };
}

function assignedQuestionsMatch(
  current: unknown,
  expected: readonly number[]
): boolean {
  return Array.isArray(current) && current.length === expected.length &&
    current.every((value, index) => value === expected[index]);
}

async function writeEvaluationDocument(
  db: Firestore,
  eventId: string,
  participantId: string,
  expectation: EvaluationWriteExpectation,
  collectionName: string,
  documentId: string,
  data: Record<string, unknown>
): Promise<void> {
  const participantRef = doc(
    collection(db, getEventCollectionPath(eventId, "participants")),
    participantId
  );
  const evaluationRef = doc(
    collection(db, getEventCollectionPath(eventId, collectionName)),
    documentId
  );

  await runTransaction(db, async (transaction) => {
    const participantSnapshot = await transaction.get(participantRef);
    if (!participantSnapshot.exists()) {
      throw new Error(`Participant ${JSON.stringify(participantId)} does not exist`);
    }
    const participant = participantSnapshot.data();
    if (participant.category !== expectation.categoryId) {
      throw new Error("Participant category changed before the evaluation write completed");
    }
    if (!assignedQuestionsMatch(
      participant.assignedQuestions,
      expectation.assignedQuestions
    )) {
      throw new Error("Participant assigned questions changed before the evaluation write completed");
    }
    if (expectation.question &&
      participant.assignedQuestions[expectation.question.number - 1] !==
        expectation.question.pageNumber) {
      throw new Error("Participant question page changed before the evaluation write completed");
    }
    // Preserve the original createdAt on re-saves; only stamp it on first write.
    const existing = await transaction.get(evaluationRef);
    const now = Timestamp.now();
    const timestamps = existing.exists()
      ? { updatedAt: now }
      : { createdAt: now, updatedAt: now };
    transaction.set(evaluationRef, { ...data, ...timestamps }, { merge: true });
    transaction.update(participantRef, { evaluationStarted: true });
  });
}

export interface SaveEvaluationScoreParams {
  eventId: string;
  participantId: string;
  juryId: string;
  questionNumber: number;
  pageNumber: number;
  categoryId: string;
  config: EventEvaluationConfigV2;
  values: QuestionValueMap;
  assignedQuestions: readonly number[];
}

/** Validates against the engine's own `validateQuestionValues` before
 * writing — a write whose values fail validation is rejected client-side
 * rather than silently persisted. */
export async function saveEvaluationScore(
  params: SaveEvaluationScoreParams,
  db: Firestore = firestore
): Promise<void> {
  const validation = validateQuestionValues(params.config, params.values);
  if (!validation.ok) {
    throw new Error(
      `Refusing to save invalid evaluation score: ${validation.errors.join("; ")}`
    );
  }

  const assignmentHash = await computeAssignmentHash(
    params.participantId,
    params.categoryId,
    params.assignedQuestions
  );

  await writeEvaluationDocument(
    db,
    params.eventId,
    params.participantId,
    {
      categoryId: params.categoryId,
      assignedQuestions: params.assignedQuestions,
      question: {
        number: params.questionNumber,
        pageNumber: params.pageNumber,
      },
    },
    EVALUATION_SCORES_COLLECTION,
    await evaluationScoreDocId(params.participantId, params.juryId, params.questionNumber),
    {
      schemaVersion: 2,
      participantId: params.participantId,
      juryId: params.juryId,
      questionNumber: params.questionNumber,
      pageNumber: params.pageNumber,
      categoryId: params.categoryId,
      configVersion: params.config.configVersion,
      scoringFingerprint: params.config.scoringFingerprint,
      algorithmVersion: params.config.algorithmVersion,
      assignmentHash,
      values: params.values,
      source: { kind: "nativeV2" },
    }
  );
}

export interface SaveJuryEvaluationInputsParams {
  eventId: string;
  participantId: string;
  juryId: string;
  categoryId: string;
  config: EventEvaluationConfigV2;
  values: AdjustmentValueMap;
  assignedQuestions: readonly number[];
}

export async function saveJuryEvaluationInputs(
  params: SaveJuryEvaluationInputsParams,
  db: Firestore = firestore
): Promise<void> {
  const validation = validateAdjustmentValues(params.config, params.values);
  if (!validation.ok) {
    throw new Error(
      `Refusing to save invalid jury evaluation inputs: ${validation.errors.join("; ")}`
    );
  }

  const assignmentHash = await computeAssignmentHash(
    params.participantId,
    params.categoryId,
    params.assignedQuestions
  );

  await writeEvaluationDocument(
    db,
    params.eventId,
    params.participantId,
    {
      categoryId: params.categoryId,
      assignedQuestions: params.assignedQuestions,
    },
    JURY_EVALUATION_INPUTS_COLLECTION,
    await juryEvaluationInputsDocId(params.participantId, params.juryId),
    {
      schemaVersion: 2,
      participantId: params.participantId,
      juryId: params.juryId,
      categoryId: params.categoryId,
      configVersion: params.config.configVersion,
      scoringFingerprint: params.config.scoringFingerprint,
      algorithmVersion: params.config.algorithmVersion,
      assignmentHash,
      values: params.values,
      source: { kind: "nativeV2" },
    }
  );
}

/** Deletes every score AND participant-adjustment doc for a (participant, jury)
 * pair — used when a participant's assigned questions change so no
 * in-progress evaluation (question scores or the overall-bonus adjustment)
 * survives the reassignment under a now-stale assignmentHash.
 *
 * Each batch commit is atomic; a clear spanning multiple batches is not atomic
 * across batches, but deletion is idempotent so an interrupted clear completes
 * on a re-run. */
export async function clearEvaluationScores(
  eventId: string,
  participantId: string,
  juryId: string,
  db: Firestore = firestore
): Promise<void> {
  const refs: DocumentReference[] = [];
  for (const collectionName of [EVALUATION_SCORES_COLLECTION, JURY_EVALUATION_INPUTS_COLLECTION]) {
    const collectionRef = collection(db, getEventCollectionPath(eventId, collectionName));
    const snapshot = await getDocs(
      query(collectionRef, where("participantId", "==", participantId), where("juryId", "==", juryId))
    );
    refs.push(...snapshot.docs.map((d) => d.ref));
  }
  for (let start = 0; start < refs.length; start += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(start, start + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}
