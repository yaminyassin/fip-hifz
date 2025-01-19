import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { collection, query, where, getDocs } from "firebase/firestore";

export const getCurrentParticipantFromFirestore = async (): Promise<Participant | null> => {
  try {
    const participantsRef = collection(firestore, "participants");
    const q = query(participantsRef, where("isActive", "==", true));
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }

    // Assuming only one participant should be active at a time
    const activeParticipant = querySnapshot.docs[0].data() as Participant;
    return activeParticipant;
  } catch (error) {
    console.error("Error fetching active participant:", error);
    throw error;
  }
};

export const getCurrentParticipant = async () => {
  const currentParticipant = await getCurrentParticipantFromFirestore();
  return currentParticipant;
};
