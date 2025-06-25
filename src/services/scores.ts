import { getDoc } from "firebase/firestore";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  doc,
  setDoc,
} from "firebase/firestore";

// src/services/scores.ts
import { firestore } from "@/main";
import { QuestionFields, Scores } from "../models/models";
import { getEventCollectionPath } from "@/utils/firebaseUtils";

// Query scores for a specific participant and question
export const getScoresForParticipantQuestion = async (
  eventId: string,
  juryId: string,
  participantId?: string,
  questionNumber?: number
): Promise<Scores | null> => {
  try {
    const documentId = `${participantId}_${juryId}_${questionNumber}`;
    const scoresCollection = collection(firestore, getEventCollectionPath(eventId, "scores"));
    const scoreRef = doc(scoresCollection, documentId);
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
 * @param eventId The event identifier.
 * @param participantId The ID of the participant.
 * @returns A promise that resolves to an array of RawScoreData.
 */
export const getScoresForParticipant = async (
  eventId: string,
  participantId: string
): Promise<RawScoreData[]> => {
  if (!participantId) {
    console.warn("getScoresForParticipant called with no participantId");
    return [];
  }

  try {
    const scoresRef = collection(firestore, getEventCollectionPath(eventId, "scores"));
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

// Create a score document with default values if it doesn't exist
export const createScoreIfNotExists = async (
  eventId: string,
  participantId: string,
  juryId: string,
  questionNumber: number,
  pageNumber: number
): Promise<void> => {
  try {
    const documentId = `${participantId}_${juryId}_${questionNumber}`;
    const scoresCollection = collection(firestore, getEventCollectionPath(eventId, "scores"));
    const scoreRef = doc(scoresCollection, documentId);
    const scoreDoc = await getDoc(scoreRef);

    if (!scoreDoc.exists()) {
      const defaultScores: QuestionFields = {
        hifdh_judge_correction: 0,
        hifdh_self_correction: 0,
        hifdh_stuck_count: 0,
        tajweed_major: 0,
        tajweed_minor: 0,
        waqf_ibtida_incorrect: 0,
        waqf_ibtida_meaning: 0,
        husn_al_ada_score: 0,
      };

      const newScore: Omit<Scores, "id"> = {
        participantId,
        juryId,
        questionNumber,
        pageNumber,
        scores: defaultScores,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await setDoc(scoreRef, newScore);
      console.log(`Created score document: ${documentId}`);
    }
  } catch (error) {
    console.error("Error creating score document:", error);
    throw error;
  }
};
