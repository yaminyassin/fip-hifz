import { Timestamp } from "firebase/firestore";

/**
 * App configuration settings stored in Firestore
 */
export type AppConfigPreviousQuestions = {
  id: string; // Document ID (e.g., "previous_questions")
  previous_questions: number[]; // Array of previously generated question page numbers
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

/**
 * The judge evaluation of a participant, per question and per participant
 * bonus, is stored config-driven per the committed evaluation engine
 * (src/evaluation/types.ts: `EvaluationScoreV2`, `JuryEvaluationInputsV2`).
 * There is no hardcoded question-fields shape here — the shape of a score
 * is defined per event by that event's `EventEvaluationConfigV2.questionTypes`
 * / `participantAdjustments`, not by this file.
 */

export type Participant = {
  id: string;
  name: string;
  age: number;
  country: string;
  category: string;
  school: string;
  scheduled: string; // order of the participant in the competition
  isDone: boolean;
  isActive: boolean;
  flag: string; // flag emoji of the country (auto-derived from country name)
  parentsName: string;
  phoneNum: string;
  email?: string; // Email address of the participant
  photo?: string; // Base64 encoded photo of the participant
  assignedQuestions: number[]; // Array of assigned question page numbers
  activeQuestion: number; // The page number the participant is currently reciting
  evaluationStarted?: boolean;
};

export type Jury = {
  id: string;
  name: string;
  currentQuestion: number;
  hasFinishedEvaluating: boolean;
  isActive: boolean;
};
