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
 * the judge evaluation of the participant, per question
 */
export type QuestionFields = {
  // Hifdh (Memorisation) - Max 100 points base per question
  hifdh_judge_correction: number; // فتح (Judge Correction): -3 points each
  hifdh_self_correction: number; // تنبيه (Self Correction): -2 points each
  hifdh_stuck_count: number; // Times Stuck: Informational, not directly penalized in new system.
  // Note: 3+ Hifdh judge corrections voids the question (score=0)

  // Tajweed (التجويد)
  tajweed_major: number; // Major Mistake (اللحن الجلي): -2 points each
  tajweed_minor: number; // Minor Mistake (اللحن الخفي): -1 point each

  // Waqf & Ibtida (Stopping & Starting - الوقف و الإبتداء)
  waqf_ibtida_incorrect: number; // Incorrect Pause/Start: -0.3 points each
  waqf_ibtida_meaning: number; // Pause/Start Alters Meaning: -0.7 points each

  // Husn al-Adā' (Fluency & Performance - حسن الأداء)
  husn_al_ada_score: number; // Count of Husn Al-Ada mistakes: -1 point each mistake

  // Overall Bonus moved to separate collection
};

export type OverallBonus = {
  id: string; // Format: `${participantId}_${juryId}`
  participantId: string;
  juryId: string;
  overallBonus: number; // Bonus points (0-5) added per question, total capped at 5 points to final average.
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Scores = {
  id: string; // Format: `${participantId}_${juryId}_${questionNumber}`
  participantId: string;
  juryId: string;
  questionNumber: number;
  pageNumber: number;
  scores: QuestionFields;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

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
};

export type Jury = {
  id: string;
  name: string;
  currentQuestion: number;
  hasFinishedEvaluating: boolean;
  isActive: boolean;
};
