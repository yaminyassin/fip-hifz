import { Participant } from "../models/models";

type JudgeScore = {
  juryId: string;
  questionNumber: number;
  scores: Record<string, number>;
};

export interface MachineContext {
  participants: Participant[];
  activeParticipant?: Participant;
  selectedQuestions: number[];
  scores: JudgeScore[];
  currentQuestionIndex: number;
}

export type MachineEvents =
  | { type: "LOG"; message: string }
  | { type: "STORE_PARTICIPANTS"; participant: Participant }
  | { type: "SELECT_PARTICIPANT"; participant: Participant }
  | { type: "PICK_QUESTIONS" }
  | { type: "SUBMIT_SCORE"; score: JudgeScore }
  | { type: "NEXT_QUESTION" }
  | { type: "COMPLETE_PARTICIPANT" };
