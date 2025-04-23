import { Timestamp } from "firebase/firestore";

export type Quran = {
  filename: string;
  page: string;
  timestamp: string;
};

/**
 * the judge evaluation of the participant, per question
 */
export type QuestionFields = {
  // Hifdh (Memorisation) - 50% Max Deduction
  hifdh_judge_correction: number; // فتح (Judge Correction): -1.5% each
  hifdh_self_correction: number; // تنبيه (Self Correction): -0.5% each
  hifdh_stuck_count: number; // Times Stuck (First time or after prompt): -0.5% each time
  // Removed hifdh_stuck_first and hifdh_stuck_prompted
  // Note: 4+ Hifdh mistakes (sum of judge, self, and stuck count) voids the question (score=0)

  // Tajweed (Qur'anic Rules) - 30% Max Deduction
  tajweed_major: number; // Major Mistake (Jali): -1% each
  tajweed_minor: number; // Minor Mistake (Khafi): -0.5% each

  // Waqf & Ibtida (Stopping & Starting) - 10% Max Deduction
  waqf_ibtida_incorrect: number; // Incorrect Pause/Start: -0.5% each
  waqf_ibtida_meaning: number; // Pause/Start Alters Meaning: -1% each (applied if relevant)

  // Husn al-Adā' (Fluency & Performance) - 10% Score Addition
  husn_al_ada_score: number; // Score (0-10) added to the percentage, max 10%

  // Overall Bonus - Max +3% Added After Averaging
  overall_bonus: number; // Bonus points (0-3) added per question, total capped at 3%
};

export type Scores = {
  id: string; // Format: `${participantId}_${juryId}_${questionNumber}`
  participantId: string;
  juryId: string;
  questionNumber: number;
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
  scheduled: string; // ?
  isDone: boolean;
  isActive: boolean;
  flag: string; // flag symbol of the country
  parentsName: string;
  phoneNum: string;
  email?: string; // Email address of the participant
  photo?: string; // Base64 encoded photo of the participant
  assignedQuestions: number[]; // Array of 3 random numbers between 1-600
};

export type Jury = {
  id: string;
  name: string;
  currentQuestion: number;
  hasFinishedEvaluating: boolean;
};
