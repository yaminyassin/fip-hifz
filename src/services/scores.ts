import { getDoc, serverTimestamp } from "firebase/firestore";

// src/services/scores.ts
import { firestore } from "@/main";
import { doc, setDoc } from "firebase/firestore";
import { QuestionFields, Scores } from "../models/models";

// Store a score
export const storeScore = async (
  participantId: string,
  juryId: string,
  questionNumber: number,
  scores: QuestionFields
) => {
  const scoreRef = doc(
    firestore,
    "scores",
    `${participantId}_${juryId}_${questionNumber}`
  );

  await setDoc(
    scoreRef,
    {
      participantId,
      juryId,
      questionNumber,
      scores,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

// Query scores for a specific participant and question
export const getScoresForParticipantQuestion = async (
  juryId: string,
  participantId?: string,
  questionNumber?: number
): Promise<Scores | null> => {
  try {
    const documentId = `${participantId}_${juryId}_${questionNumber}`;
    const scoreRef = doc(firestore, "scores", documentId);
    const scoreDoc = await getDoc(scoreRef);

    if (!scoreDoc.exists()) {
      return null;
    }

    return scoreDoc.data() as Scores;
  } catch (error) {
    console.error("Error fetching score:", error);
    throw error;
  }
};
