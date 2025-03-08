import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { 
  addDoc, 
  collection, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  updateDoc 
} from "firebase/firestore";

type ParticipantInput = Omit<Participant, 'id' | 'assignedQuestions'> & {
  assignedQuestions?: number[];
};

/**
 * Creates a new participant in Firestore
 * @param participant The participant data to create
 * @returns A promise that resolves to the ID of the newly created participant
 */
export const createParticipant = async (participant: ParticipantInput): Promise<string> => {
  const participantsRef = collection(firestore, "participants");
  
  // Default values for a new participant
  const newParticipant = {
    ...participant,
    assignedQuestions: participant.assignedQuestions || [],
    isDone: participant.isDone || false,
    isActive: participant.isActive || false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const docRef = await addDoc(participantsRef, newParticipant);
  return docRef.id;
};

/**
 * Updates an existing participant in Firestore
 * @param id The ID of the participant to update
 * @param participant The updated participant data
 */
export const updateParticipant = async (id: string, participant: ParticipantInput): Promise<void> => {
  const participantRef = doc(firestore, "participants", id);
  
  await updateDoc(participantRef, {
    ...participant,
    updatedAt: serverTimestamp()
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