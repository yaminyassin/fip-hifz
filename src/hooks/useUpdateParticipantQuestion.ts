import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateParticipantQuestion } from "@/services/updateParticipantQuestions";
import { Participant } from "@/models/models";

export const useUpdateParticipantQuestion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      participantId, 
      questionIndex,
      pageNumber
    }: { 
      participantId: string; 
      questionIndex: number;
      pageNumber: number;
    }) => {
      try {
        return await updateParticipantQuestion(participantId, questionIndex, pageNumber);
      } catch (error) {
        console.error("Error in updateParticipantQuestion mutation:", error);
        throw error;
      }
    },
    onMutate: async ({ participantId, questionIndex, pageNumber }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["activeParticipant"] });
      
      // Snapshot the previous value
      const previousParticipant = queryClient.getQueryData<Participant | null>(["activeParticipant"]);
      
      // Optimistically update to the new value
      if (previousParticipant && previousParticipant.id === participantId) {
        const updatedParticipant = { ...previousParticipant };
        
        // Ensure assignedQuestions array exists and is large enough
        if (!updatedParticipant.assignedQuestions) {
          updatedParticipant.assignedQuestions = [];
        }
        
        while (updatedParticipant.assignedQuestions.length <= questionIndex) {
          updatedParticipant.assignedQuestions.push(0);
        }
        
        // Update the specific question
        updatedParticipant.assignedQuestions[questionIndex] = pageNumber;
        
        // Update the cache with our optimistic value
        queryClient.setQueryData(["activeParticipant"], updatedParticipant);
      }
      
      // Return the previous value so we can roll back if something goes wrong
      return { previousParticipant };
    },
    onError: (error, _variables, context) => {
      console.error("Error in updateParticipantQuestion mutation:", error);
      
      // If we have a previous value, roll back to it
      if (context?.previousParticipant) {
        queryClient.setQueryData(["activeParticipant"], context.previousParticipant);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we're in sync with the server
      queryClient.invalidateQueries({ queryKey: ["activeParticipant"] });
    },
  });
}; 