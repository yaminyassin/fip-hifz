import { firestore } from "@/main";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

// Update all questions at once
export const updateParticipantQuestions = async (
  participantId: string,
  questions: number[]
) => {
  try {
    const participantRef = doc(firestore, "participants", participantId);
    await updateDoc(participantRef, {
      assignedQuestions: questions,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error updating participant questions:", error);
    throw error;
  }
};

// Update a single question at a specific index
export const updateParticipantQuestion = async (
  participantId: string,
  questionIndex: number,
  pageNumber: number
) => {
  try {
    const participantRef = doc(firestore, "participants", participantId);

    // Get the current questions
    const participantDoc = await getDoc(participantRef);
    if (!participantDoc.exists()) {
      const error = new Error("Participant not found");
      console.error(error);
      throw error;
    }

    const data = participantDoc.data();
    const questions = Array.isArray(data.assignedQuestions)
      ? [...data.assignedQuestions]
      : [];

    // Ensure the array is large enough
    while (questions.length <= questionIndex) {
      questions.push(0); // Fill with 0 (no page assigned)
    }

    // Update the specific question
    questions[questionIndex] = pageNumber;

    // Update the document - explicitly set isActive to true to ensure it remains active
    await updateDoc(participantRef, {
      assignedQuestions: questions,
      isActive: true, // Explicitly set isActive to true
      updatedAt: serverTimestamp(),
    });

    return questions;
  } catch (error) {
    console.error("Error updating participant question:", error);
    throw error;
  }
};
