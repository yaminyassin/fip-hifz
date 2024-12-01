import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useQuery, useMutation } from "@tanstack/react-query";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";

type UpdateQuestionParams = {
  participantId: string;
  questions: number[];
};

const updateParticipantQuestions = async ({
  participantId,
  questions,
}: UpdateQuestionParams) => {
  const participantRef = doc(firestore, "participants", participantId);
  await updateDoc(participantRef, {
    assignedQuestions: questions,
    updatedAt: new Date().toISOString(),
  });
};

export const useParticipant = (participantId: string) => {
  return useQuery({
    queryKey: ["participants", participantId],
    queryFn: () =>
      new Promise<Participant>((resolve, reject) => {
        const participantRef = doc(firestore, "participants", participantId);
        const unsubscribe = onSnapshot(
          participantRef,
          (doc) => {
            if (!doc.exists()) {
              reject(new Error("Participant not found"));
              return;
            }
            resolve(doc.data() as Participant);
          },
          reject
        );

        // Cleanup subscription on abort
        return () => unsubscribe();
      }),
  });
};

export const useUpdateParticipantQuestions = () => {
  return useMutation({
    mutationFn: updateParticipantQuestions,
  });
};
