import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateJuryProgress } from "../services/jury";
import { QuestionFields } from "../models/models";

// Define a type for scores that don't include overall_bonus
type QuestionOnlyFields = Omit<QuestionFields, "overall_bonus">;

interface Participant {
  id: string;
  name: string;
  age: number;
  category: string;
  assignedQuestions?: number[];
  isActive?: boolean;
}

interface Jury {
  id: string;
  name: string;
  currentQuestion: number;
  hasFinishedEvaluating: boolean;
}

interface SaveScoresMutation {
  mutateAsync: (params: {
    questionNumToSave: number;
    scoresToSave: QuestionFields;
  }) => Promise<void>;
}

interface UseJuryNavigationProps {
  participant: Participant | null;
  juryMember: Jury | null;
  juryId: string | null;
  debounceTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  saveScoresMutation: SaveScoresMutation;
  currentScores: QuestionOnlyFields;
  overallBonus: number;
}

export const useJuryNavigation = ({
  participant,
  juryMember,
  juryId,
  debounceTimeoutRef,
  saveScoresMutation,
  currentScores,
  overallBonus,
}: UseJuryNavigationProps) => {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const queryClient = useQueryClient();

  // Update jury progress mutation
  const updateJuryMutation = useMutation({
    mutationFn: async ({
      currentQuestion,
      hasFinishedEvaluating,
    }: {
      currentQuestion: number;
      hasFinishedEvaluating: boolean;
    }) => {
      if (!juryId) return;
      await updateJuryProgress(juryId, currentQuestion, hasFinishedEvaluating);
    },
    onSuccess: () => {
      // Removed invalidateQueries for jury data since we use real-time Firebase updates
    },
  });

  // Reset question selection when participant changes
  useEffect(() => {
    if (participant?.id) {
      setSelectedQuestion(1);
    }
  }, [participant?.id]);

  // Reset when jury changes
  useEffect(() => {
    if (juryId && participant?.id) {
      setSelectedQuestion(1);
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
      // Removed invalidateQueries for jury data since we use real-time Firebase updates
    }
  }, [juryId, queryClient, participant?.id]);

  const handleQuestionChange = async (questionNumber: number) => {
    // Clear any pending debounced save from the previous question
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    // Update selected question state
    setSelectedQuestion(questionNumber);

    // Update jury progress in Firestore
    if (juryMember && !juryMember.hasFinishedEvaluating) {
      updateJuryMutation.mutate({
        currentQuestion: questionNumber,
        hasFinishedEvaluating: false,
      });
    }
  };

  const handleDone = async () => {
    if (!participant?.assignedQuestions || !juryId) return;

    const totalQuestions = participant.assignedQuestions.length;

    try {
      // Save the current question's scores first
      const finalScoresToSave = {
        ...currentScores,
        overall_bonus: overallBonus,
      };

      await saveScoresMutation.mutateAsync({
        questionNumToSave: selectedQuestion,
        scoresToSave: finalScoresToSave,
      });

      // Update jury progress to finished
      updateJuryMutation.mutate({
        currentQuestion: totalQuestions,
        hasFinishedEvaluating: true,
      });
    } catch (error) {
      console.error("Error during handleDone execution:", error);
    }
  };

  return {
    selectedQuestion,
    setSelectedQuestion,
    handleQuestionChange,
    handleDone,
    updateJuryMutation,
  };
};
