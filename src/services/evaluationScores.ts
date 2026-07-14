import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  Timestamp,
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
import type { EventEvaluationConfigV2 } from "@/evaluation/types";

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

export function evaluationScoreDocId(
  participantId: string,
  juryId: string,
  questionNumber: number
): string {
  return `${participantId}_${juryId}_${questionNumber}`;
}

export function juryEvaluationInputsDocId(
  participantId: string,
  juryId: string
): string {
  return `${participantId}_${juryId}`;
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

  const docRef = doc(
    collection(db, getEventCollectionPath(params.eventId, EVALUATION_SCORES_COLLECTION)),
    evaluationScoreDocId(params.participantId, params.juryId, params.questionNumber)
  );

  await setDoc(
    docRef,
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
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    },
    { merge: true }
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

  const docRef = doc(
    collection(db, getEventCollectionPath(params.eventId, JURY_EVALUATION_INPUTS_COLLECTION)),
    juryEvaluationInputsDocId(params.participantId, params.juryId)
  );

  await setDoc(
    docRef,
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
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/** Deletes every evaluationScores doc for a (participant, jury) pair — used
 * when a participant's assigned questions change and prior in-progress
 * scores must not survive the reassignment. */
export async function clearEvaluationScores(
  eventId: string,
  participantId: string,
  juryId: string,
  db: Firestore = firestore
): Promise<void> {
  const scoresRef = collection(db, getEventCollectionPath(eventId, EVALUATION_SCORES_COLLECTION));
  const snapshot = await getDocs(
    query(scoresRef, where("participantId", "==", participantId), where("juryId", "==", juryId))
  );
  await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
}
