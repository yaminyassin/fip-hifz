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
  hifz_reminder: number;
  hifz_assitance: number;
  tajweed_minor: number;
  tajweed_major: number;
  fluency: number;
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
  assignedQuestions: number[]; // Array of 3 random numbers between 1-600
};

export type Jury = {
  id: string;
  name: string;
};
