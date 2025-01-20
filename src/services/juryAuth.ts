import { firestore } from "@/main";
import { doc, getDoc } from "firebase/firestore";
import { Jury } from "@/models/models";

export const authenticateJury = async (juryId: string): Promise<Jury | null> => {
  try {
    const juryRef = doc(firestore, "jury", juryId);
    const juryDoc = await getDoc(juryRef);

    if (!juryDoc.exists()) {
      return null;
    }

    return {
      id: juryDoc.id,
      ...juryDoc.data()
    } as Jury;
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