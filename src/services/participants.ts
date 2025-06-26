import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
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
 * Converts a participant name to a valid Firestore document ID
 * @param name The participant's name
 * @returns A lowercase, underscore-separated document ID
 */
const generateParticipantId = (name: string): string => {
  return (
    name
      .toLowerCase()
      .trim()
      // Replace spaces with underscores
      .replace(/\s+/g, "_")
      // Remove any characters that aren't letters, numbers, or underscores
      .replace(/[^a-z0-9_]/g, "")
      // Ensure it doesn't start or end with underscore
      .replace(/^_+|_+$/g, "")
      // Collapse multiple underscores into single ones
      .replace(/_+/g, "_")
  );
};

/**
 * Generates a unique participant ID by checking for existing documents
 * @param eventId The event identifier
 * @param name The participant's name
 * @returns A unique document ID
 */
const generateUniqueParticipantId = async (
  eventId: string,
  name: string
): Promise<string> => {
  const baseId = generateParticipantId(name);

  if (!baseId) {
    throw new Error(
      "Unable to generate valid document ID from participant name"
    );
  }

  let participantId = baseId;
  let counter = 1;

  // Check if document already exists and add suffix if needed
  while (true) {
    const participantsCollection = collection(
      firestore,
      getEventCollectionPath(eventId, "participants")
    );
    const participantRef = doc(participantsCollection, participantId);
    const docSnapshot = await getDoc(participantRef);

    if (!docSnapshot.exists()) {
      // Found a unique ID
      return participantId;
    }

    // Document exists, try with a suffix
    participantId = `${baseId}_${counter}`;
    counter++;

    // Safety check to prevent infinite loop (though very unlikely)
    if (counter > 100) {
      throw new Error(
        "Unable to generate unique participant ID after 100 attempts"
      );
    }
  }
};

/**
 * Creates a new participant in Firestore
 * @param eventId The event identifier
 * @param participant The participant data to create
 * @returns A promise that resolves to the ID of the newly created participant
 */
export const createParticipant = async (
  eventId: string,
  participant: ParticipantInput
): Promise<string> => {
  // Generate unique document ID from participant name
  const participantId = await generateUniqueParticipantId(
    eventId,
    participant.name
  );

  const participantsCollection = collection(
    firestore,
    getEventCollectionPath(eventId, "participants")
  );
  const participantRef = doc(participantsCollection, participantId);

  // Default values for a new participant
  const newParticipant = {
    ...participant,
    assignedQuestions: participant.assignedQuestions || [],
    isDone: participant.isDone || false,
    isActive: participant.isActive || false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(participantRef, newParticipant);
  return participantId;
};

/**
 * Updates an existing participant in Firestore
 * @param eventId The event identifier
 * @param id The ID of the participant to update
 * @param participant The updated participant data
 */
export const updateParticipant = async (
  eventId: string,
  id: string,
  participant: ParticipantInput
): Promise<void> => {
  const participantsCollection = collection(
    firestore,
    getEventCollectionPath(eventId, "participants")
  );
  const participantRef = doc(participantsCollection, id);

  await updateDoc(participantRef, {
    ...participant,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Deletes a participant from Firestore
 * @param eventId The event identifier
 * @param id The ID of the participant to delete
 */
export const deleteParticipant = async (
  eventId: string,
  id: string
): Promise<void> => {
  const participantsCollection = collection(
    firestore,
    getEventCollectionPath(eventId, "participants")
  );
  const participantRef = doc(participantsCollection, id);
  await deleteDoc(participantRef);
};

/**
 * Resets the isDone status for all participants in Firestore.
 * @param eventId The event identifier
 */
export const resetAllParticipantStatuses = async (
  eventId: string
): Promise<void> => {
  const participantsRef = collection(
    firestore,
    getEventCollectionPath(eventId, "participants")
  );
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
 * @param eventId The event identifier
 * @param participantId The ID of the participant to update.
 * @param newActiveQuestionPage The new page number to set as active.
 */
export const updateActiveQuestion = async (
  eventId: string,
  participantId: string,
  newActiveQuestionPage: number
): Promise<void> => {
  if (!participantId) {
    console.error("updateActiveQuestion called with invalid participantId");
    throw new Error("Invalid participant ID provided.");
  }

  const participantsCollection = collection(
    firestore,
    getEventCollectionPath(eventId, "participants")
  );
  const participantRef = doc(participantsCollection, participantId);

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
