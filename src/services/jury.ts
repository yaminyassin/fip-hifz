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

export const updateJuryProgress = async (
  juryId: string,
  currentQuestion: number,
  hasFinishedEvaluating: boolean
) => {
  const juryRef = doc(firestore, "jury", juryId);

  await updateDoc(juryRef, {
    currentQuestion,
    hasFinishedEvaluating,
  });
};

export const getJuryMember = async (juryId: string): Promise<Jury | null> => {
  const juryRef = doc(firestore, "jury", juryId);
  const juryDoc = await getDoc(juryRef);

  if (!juryDoc.exists()) {
    return null;
  }

  return { id: juryDoc.id, ...juryDoc.data() } as Jury;
};

export const addJury = async (jury: Omit<Jury, "id">): Promise<string> => {
  try {
    const juryRef = collection(firestore, "jury");
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
  id: string,
  jury: Partial<Omit<Jury, "id">>
): Promise<void> => {
  try {
    const juryRef = doc(firestore, "jury", id);
    await updateDoc(juryRef, jury);
  } catch (error) {
    console.error("Error updating jury member:", error);
    throw error;
  }
};

export const deleteJury = async (id: string): Promise<void> => {
  try {
    const juryRef = doc(firestore, "jury", id);
    await deleteDoc(juryRef);
  } catch (error) {
    console.error("Error deleting jury member:", error);
    throw error;
  }
};

export const updateJuryActiveStatus = async (
  juryId: string,
  isActive: boolean
): Promise<void> => {
  try {
    const juryRef = doc(firestore, "jury", juryId);
    await updateDoc(juryRef, { isActive });
  } catch (error) {
    console.error("Error updating jury active status:", error);
    throw error;
  }
};

export const setAllJuryActive = async (isActive: boolean): Promise<void> => {
  try {
    const juryCollection = collection(firestore, "jury");
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
