import { getDoc, serverTimestamp } from "firebase/firestore";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";

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

// Define a type for the raw score document data
export type RawScoreData = {
  participantId: string;
  juryId: string;
  questionNumber: number;
  pageNumber: number;
  scores: QuestionFields;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * Fetches all raw score documents for a specific participant.
 * This fetches scores from ALL jury members for that participant.
 * @param participantId The ID of the participant.
 * @returns A promise that resolves to an array of RawScoreData.
 */
export const getScoresForParticipant = async (
  participantId: string
): Promise<RawScoreData[]> => {
  if (!participantId) {
    console.warn("getScoresForParticipant called with no participantId");
    return [];
  }

  try {
    const scoresRef = collection(firestore, "scores");
    const q = query(scoresRef, where("participantId", "==", participantId));
    const snapshot = await getDocs(q);

    const scores: RawScoreData[] = [];
    snapshot.forEach((doc) => {
      // Basic validation might be needed here depending on data integrity
      scores.push(doc.data() as RawScoreData);
    });

    console.log(
      `Fetched ${scores.length} score documents for participant ${participantId}`
    );
    return scores;
  } catch (error) {
    console.error(
      `Error fetching scores for participant ${participantId}:`,
      error
    );
    // Depending on requirements, you might want to throw the error
    // or return an empty array / specific error state.
    return [];
  }
};
