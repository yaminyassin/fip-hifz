import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateActiveQuestion } from "@/services/participants";
import { useEvent } from "@/contexts/EventContext";
import { Participant } from "@/models/models";

export const useUpdateActiveQuestion = () => {
  const { currentEvent } = useEvent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      participantId,
      activeQuestionPage,
    }: {
      participantId: string;
      activeQuestionPage: number;
    }) => {
      if (!currentEvent) throw new Error('No event selected');
      try {
        return await updateActiveQuestion(currentEvent, participantId, activeQuestionPage);
      } catch (error) {
        console.error("Error in updateActiveQuestion mutation:", error);
        throw error;
      }
    },
    onMutate: async ({ participantId, activeQuestionPage }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["activeParticipant"] });

      // Snapshot the previous value
      const previousParticipant = queryClient.getQueryData<Participant | null>([
        "activeParticipant",
      ]);

      // Optimistically update to the new value
      if (previousParticipant && previousParticipant.id === participantId) {
        const updatedParticipant = {
          ...previousParticipant,
          activeQuestion: activeQuestionPage,
        };

        // Update the cache with our optimistic value
        queryClient.setQueryData(["activeParticipant"], updatedParticipant);
      }

      // Return the previous value so we can roll back if something goes wrong
      return { previousParticipant };
    },
    onError: (error, _variables, context) => {
      console.error("Error in updateActiveQuestion mutation:", error);

      // If we have a previous value, roll back to it
      if (context?.previousParticipant) {
        queryClient.setQueryData(
          ["activeParticipant"],
          context.previousParticipant
        );
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we're in sync with the server
      queryClient.invalidateQueries({ queryKey: ["activeParticipant"] });
    },
  });
};
