export type Participant = {
  id: string;
  name: string;
  age: number;
  country: string;
  category: string;
  assignedQuestions: number[]; // Array of 3 random numbers between 1-600
  createdAt: string;
};

export type Jury = {
  id: string;
  name: string;
  createdAt: string;
};

export type Record = {
  id: string;
  participantId: string;
  jurorId: string;
  questionNumber: number;
  scores: {
    [key: string]: number;
  };
  createdAt: string;
  updatedAt: string;
};
