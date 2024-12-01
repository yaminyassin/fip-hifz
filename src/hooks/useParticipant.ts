import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useQuery, useMutation } from "@tanstack/react-query";
import { doc, getDoc, updateDoc } from "firebase/firestore";

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

const getParticipant = async (participantId: string) => {
  const participantRef = doc(firestore, "participants", participantId);
  const participantSnap = await getDoc(participantRef);
  if (!participantSnap.exists()) throw new Error("Participant not found");
  return participantSnap.data() as Participant;
};

export const useParticipant = (participantId: string) => {
  return useQuery({
    queryKey: ["participant", participantId],
    queryFn: () => getParticipant(participantId),
  });
};

export const useUpdateParticipantQuestions = () => {
  return useMutation({
    mutationFn: updateParticipantQuestions,
  });
};
