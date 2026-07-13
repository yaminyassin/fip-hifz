import { getDoc } from "firebase/firestore";
import {
  collection,
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
