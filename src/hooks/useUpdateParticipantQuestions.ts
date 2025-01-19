import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateParticipantQuestions } from "@/services/updateParticipantQuestions";

export const useUpdateParticipantQuestions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      participantId, 
      questions 
    }: { 
      participantId: string; 
      questions: number[] 
    }) => {
      await updateParticipantQuestions(participantId, questions);
    },
    onSuccess: () => {
      // Invalidate and refetch active participant data
      queryClient.invalidateQueries({ queryKey: ["activeParticipant"] });
    },
  });
}; 