import { Timestamp } from "firebase/firestore";

export type Quran = {
  filename: string;
  page: string;
  timestamp: string;
};

/**
 * the judge evaluation of the participant
 */
export type QuestionFields = {
  // Hifz errors (60%)
  hifz_fath: number; // -2% each
  hifz_tannin: number; // -1% each
  hifz_taraddud: number; // -0.5% each
  
  // Tajweed errors (30%)
  tajweed_jali: number; // -2% each
  tajweed_khafi: number; // -1% each
  
  // Waqf errors (10%)
  waqf_ibtida: number; // -1% each
  
  // Performance/Fluency bonus (up to +5%)
  fluency_bonus: number; // +1% each, max 5
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
