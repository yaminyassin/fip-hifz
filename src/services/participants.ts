import { firestore } from "@/main";
import { Participant } from "@/models/models";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  query,
  getDocs,
  writeBatch,
} from "firebase/firestore";

type ParticipantInput = Omit<Participant, "id" | "assignedQuestions"> & {
  assignedQuestions?: number[];
};

/**
 * Creates a new participant in Firestore
 * @param participant The participant data to create
 * @returns A promise that resolves to the ID of the newly created participant
 */
export const createParticipant = async (
  participant: ParticipantInput
): Promise<string> => {
  const participantsRef = collection(firestore, "participants");

  // Default values for a new participant
  const newParticipant = {
    ...participant,
    assignedQuestions: participant.assignedQuestions || [],
    isDone: participant.isDone || false,
    isActive: participant.isActive || false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(participantsRef, newParticipant);
  return docRef.id;
};

/**
 * Updates an existing participant in Firestore
 * @param id The ID of the participant to update
 * @param participant The updated participant data
 */
export const updateParticipant = async (
  id: string,
  participant: ParticipantInput
): Promise<void> => {
  const participantRef = doc(firestore, "participants", id);

  await updateDoc(participantRef, {
    ...participant,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Deletes a participant from Firestore
 * @param id The ID of the participant to delete
 */
export const deleteParticipant = async (id: string): Promise<void> => {
  const participantRef = doc(firestore, "participants", id);
  await deleteDoc(participantRef);
};

/**
 * Resets the isDone status for all participants in Firestore.
 */
export const resetAllParticipantStatuses = async (): Promise<void> => {
  const participantsRef = collection(firestore, "participants");
  const q = query(participantsRef); // Query all participants
  const batch = writeBatch(firestore);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnapshot) => {
      // Update only the isDone field to false
      batch.update(docSnapshot.ref, { isDone: false });
    });

    await batch.commit();
    console.log("Successfully reset isDone status for all participants.");
  } catch (error) {
    console.error("Error resetting participant statuses:", error);
    throw new Error("Failed to reset participant statuses."); // Re-throw for mutation error handling
  }
};

/**
 * Updates the activeQuestion field for a specific participant.
 * @param participantId The ID of the participant to update.
 * @param newActiveQuestionPage The new page number to set as active.
 */
export const updateActiveQuestion = async (
  participantId: string,
  newActiveQuestionPage: number
): Promise<void> => {
  if (!participantId) {
    console.error("updateActiveQuestion called with invalid participantId");
    throw new Error("Invalid participant ID provided.");
  }

  const participantRef = doc(firestore, "participants", participantId);

  try {
    await updateDoc(participantRef, {
      activeQuestion: newActiveQuestionPage,
      updatedAt: serverTimestamp(), // Also update the timestamp
    });
    console.log(
      `Successfully updated activeQuestion for participant ${participantId} to ${newActiveQuestionPage}.`
    );
  } catch (error) {
    console.error(
      `Error updating activeQuestion for participant ${participantId}:`,
      error
    );
    throw new Error("Failed to update active question."); // Re-throw for mutation error handling
  }
};
