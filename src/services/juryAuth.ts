import { firestore } from "@/main";
import { doc, getDoc, collection } from "firebase/firestore";
import { Jury } from "@/models/models";
import { updateJuryActiveStatus } from "./jury";
import { getEventCollectionPath } from "@/utils/firebaseUtils";

export const authenticateJury = async (eventId: string, juryId: string): Promise<Jury | null> => {
  try {
    const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
    const juryRef = doc(juryCollection, juryId);
    const juryDoc = await getDoc(juryRef);

    if (!juryDoc.exists()) {
      return null;
    }

    const jury = {
      id: juryDoc.id,
      ...juryDoc.data()
    } as Jury;

    // Automatically activate the jury member upon successful login
    await updateJuryActiveStatus(eventId, juryId, true);
    console.log(`Jury member ${juryId} (${jury.name}) has been automatically activated`);

    return jury;
  } catch (error) {
    console.error("Error authenticating jury:", error);
    return null;
  }
};

// Store the authenticated jury ID in session storage
export const setAuthenticatedJury = (juryId: string) => {
  sessionStorage.setItem("authenticatedJuryId", juryId);
};

// Get the authenticated jury ID from session storage
export const getAuthenticatedJury = (): string | null => {
  return sessionStorage.getItem("authenticatedJuryId");
};

// Remove the authenticated jury ID from session storage
export const clearAuthenticatedJury = () => {
  sessionStorage.removeItem("authenticatedJuryId");
};

// Logout jury member and automatically deactivate them
export const logoutJury = async (eventId: string): Promise<void> => {
  try {
    const juryId = getAuthenticatedJury();

    if (juryId) {
      // Automatically deactivate the jury member upon logout
      await updateJuryActiveStatus(eventId, juryId, false);
      console.log(`Jury member ${juryId} has been automatically deactivated`);
    }

    // Clear the authenticated jury from session storage
    clearAuthenticatedJury();
  } catch (error) {
    console.error("Error during jury logout:", error);
    // Still clear session storage even if deactivation fails
    clearAuthenticatedJury();
    throw error;
  }
}; 