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

    return { ...jury, isActive: true };
  } catch (error) {
    console.error("Error authenticating jury:", error);
    return null;
  }
};

const authenticatedJuryStorageKey = (eventId: string): string =>
  `authenticatedJuryId:${eventId}`;

// Jury identity is event-scoped so switching events cannot reuse another
// event's jury document ID.
export const setAuthenticatedJury = (eventId: string, juryId: string): void => {
  sessionStorage.setItem(authenticatedJuryStorageKey(eventId), juryId);
};

export const getAuthenticatedJury = (eventId: string): string | null => {
  return sessionStorage.getItem(authenticatedJuryStorageKey(eventId));
};

export const clearAuthenticatedJury = (eventId: string): void => {
  sessionStorage.removeItem(authenticatedJuryStorageKey(eventId));
};

/** Deactivates the live jury session without clearing reloadable browser state. */
export const deactivateJurySession = async (
  eventId: string,
  juryId: string
): Promise<void> => {
  await updateJuryActiveStatus(eventId, juryId, false);
};

// Logout jury member and automatically deactivate them
export const logoutJury = async (eventId: string): Promise<void> => {
  try {
    const juryId = getAuthenticatedJury(eventId);

    if (juryId) {
      // Automatically deactivate the jury member upon logout
      await updateJuryActiveStatus(eventId, juryId, false);
    }

    // Clear the authenticated jury from session storage
    clearAuthenticatedJury(eventId);
  } catch (error) {
    console.error("Error during jury logout:", error);
    // Still clear session storage even if deactivation fails
    clearAuthenticatedJury(eventId);
    throw error;
  }
};
