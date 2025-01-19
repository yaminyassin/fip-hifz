import { firestore } from "@/main";
import { doc, updateDoc } from "firebase/firestore";

export const updateParticipantQuestions = async (
  participantId: string,
  questions: number[]
) => {
  try {
    const participantRef = doc(firestore, "participants", participantId);
    await updateDoc(participantRef, {
      assignedQuestions: questions,
    });
  } catch (error) {
    console.error("Error updating participant questions:", error);
    throw error;
  }
}; 