export type Quran = {
  filename: string;
  page: string;
  timestamp: string;
};

/**
 * the judge evaluation of the participant
 */
export type QuestionScore = {
  hifz_reminder: number;
  hifz_assitance: number;
  tajweed_minor: number;
  tajweed_major: number;
  fluency: number;
};

/**
 * Question number:string -> result:QuestionScore
 */
export type Results = Map<string, QuestionScore>;

/**
 * id: string -> Results
 */
export type scores = Map<string, Results>;

/**
 * {
 *  Judge 1 : {
 *    Question X : {
 *      hifz_reminder: 1,
 *      hifz_assitance: 2,
 *      ...
 *    },
 *    Question Y : {
 *     hifz_reminder: 1,
 *     ...
 *    }
 *    ...
 *  Judge 2 ...
 * }
 *
 */
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
  scores: scores;
};

/**
 * {
 *  Participant 1 : {
 *    Question X : {
 *      hifz_reminder: 1,
 *      hifz_assitance: 2,
 *      ...
 *    },
 *    Question Y : {
 *     hifz_reminder: 1,
 *     ...
 *    }
 *    ...
 *  Participant 2 ...
 * }
 *
 */
export type Jury = {
  id: string;
  name: string;
  scores: Results;
};
