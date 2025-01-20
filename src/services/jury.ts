import { firestore } from "@/main";
import { doc, updateDoc, getDoc } from "firebase/firestore";
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