import { firestore } from "@/main";
import {
  doc,
  updateDoc,
  getDoc,
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { Jury } from "@/models/models";
import { getEventCollectionPath } from "@/utils/firebaseUtils";

export const updateJuryProgress = async (
  eventId: string,
  juryId: string,
  currentQuestion: number,
  hasFinishedEvaluating: boolean
) => {
  const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
  const juryRef = doc(juryCollection, juryId);

  await updateDoc(juryRef, {
    currentQuestion,
    hasFinishedEvaluating,
  });
};

export const getJuryMember = async (eventId: string, juryId: string): Promise<Jury | null> => {
  const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
  const juryRef = doc(juryCollection, juryId);
  const juryDoc = await getDoc(juryRef);

  if (!juryDoc.exists()) {
    return null;
  }

  return { id: juryDoc.id, ...juryDoc.data() } as Jury;
};

export const addJury = async (eventId: string, jury: Omit<Jury, "id">): Promise<string> => {
  try {
    const juryRef = collection(firestore, getEventCollectionPath(eventId, "jury"));
    const docRef = await addDoc(juryRef, jury);

    // Update the document to include its ID as a field
    await updateDoc(docRef, { id: docRef.id });

    return docRef.id;
  } catch (error) {
    console.error("Error adding jury member:", error);
    throw error;
  }
};

export const updateJury = async (
  eventId: string,
  id: string,
  jury: Partial<Omit<Jury, "id">>
): Promise<void> => {
  try {
    const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
    const juryRef = doc(juryCollection, id);
    await updateDoc(juryRef, jury);
  } catch (error) {
    console.error("Error updating jury member:", error);
    throw error;
  }
};

export const deleteJury = async (eventId: string, id: string): Promise<void> => {
  try {
    const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
    const juryRef = doc(juryCollection, id);
    await deleteDoc(juryRef);
  } catch (error) {
    console.error("Error deleting jury member:", error);
    throw error;
  }
};

export const updateJuryActiveStatus = async (
  eventId: string,
  juryId: string,
  isActive: boolean
): Promise<void> => {
  try {
    const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
    const juryRef = doc(juryCollection, juryId);
    await updateDoc(juryRef, { isActive });
  } catch (error) {
    console.error("Error updating jury active status:", error);
    throw error;
  }
};

export const updateJuryEvaluationStatus = async (
  eventId: string,
  juryId: string,
  hasFinishedEvaluating: boolean
): Promise<void> => {
  try {
    const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
    const juryRef = doc(juryCollection, juryId);
    await updateDoc(juryRef, { hasFinishedEvaluating });
  } catch (error) {
    console.error("Error updating jury evaluation status:", error);
    throw error;
  }
};

export const setAllJuryActive = async (eventId: string, isActive: boolean): Promise<void> => {
  try {
    const juryCollection = collection(firestore, getEventCollectionPath(eventId, "jury"));
    const jurySnapshot = await getDocs(juryCollection);

    const batch = writeBatch(firestore);

    jurySnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { isActive });
    });

    await batch.commit();
  } catch (error) {
    console.error("Error setting all jury active status:", error);
    throw error;
  }
};
