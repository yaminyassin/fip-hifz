import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();

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
            const data = doc.data() as Participant;
            // Update cache in real-time
            queryClient.setQueryData(["participants", participantId], data);
            resolve(data);
          },
          reject
        );

        // Cleanup subscription when query is unmounted
        return () => unsubscribe();
      }),
    staleTime: Infinity, // Keep the data fresh since we're using real-time updates
  });
};

export const useUpdateParticipantQuestions = () => {
  return useMutation({
    mutationFn: updateParticipantQuestions,
  });
};
