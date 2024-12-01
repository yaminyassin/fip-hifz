// src/services/scores.ts
import { firestore } from "@/main";
import { doc, setDoc } from "firebase/firestore";

interface Score {
  juryId: string;
  participantId: string;
  category: string;
  timestamp: Date;
  [key: number]: number; // For question scores
}

export class ScoresService {
  static async updateScore(
    participantId: string,
    juryId: string,
    category: string,
    question: number,
    score: number
  ) {
    try {
      const scoreDocRef = doc(
        firestore,
        "scores",
        `${participantId}_${juryId}_${category}`
      );

      await setDoc(
        scoreDocRef,
        {
          juryId,
          participantId,
          category,
          [question]: score,
          timestamp: new Date(),
        } as Score,
        { merge: true }
      );
    } catch (error) {
      console.error("Error updating score:", error);
      throw error;
    }
  }
}
