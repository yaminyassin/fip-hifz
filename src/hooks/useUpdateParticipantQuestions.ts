import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateParticipantQuestions } from "@/services/updateParticipantQuestions";
import { useEvent } from "@/contexts/EventContext";

export const useUpdateParticipantQuestions = () => {
  const { currentEvent } = useEvent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      participantId, 
      questions 
    }: { 
      participantId: string; 
      questions: number[] 
    }) => {
      await updateParticipantQuestions(currentEvent || 'lisbon-2025', participantId, questions);
    },
    onSuccess: () => {
      // Invalidate and refetch active participant data
      queryClient.invalidateQueries({ queryKey: ["activeParticipant"] });
    },
  });
}; 