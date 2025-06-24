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
  activeQuestion?: number;
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
  const [questionChangedExternally, setQuestionChangedExternally] = useState(false);
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
      setQuestionChangedExternally(false);
    }
  }, [participant?.id]);

  // Sync selectedQuestion with participant's activeQuestion
  useEffect(() => {
    if (participant?.assignedQuestions && participant?.activeQuestion) {
      // Find which question index corresponds to the active page
      const questionIndex = participant.assignedQuestions.indexOf(participant.activeQuestion);
      if (questionIndex !== -1) {
        const newQuestionNumber = questionIndex + 1; // Convert to 1-based
        if (newQuestionNumber !== selectedQuestion) {
          console.log(`[useJuryNavigation] Admin changed question to ${newQuestionNumber} (page ${participant.activeQuestion})`);
          setSelectedQuestion(newQuestionNumber);
          setQuestionChangedExternally(true);

          // Clear the external change indicator after a delay
          setTimeout(() => {
            setQuestionChangedExternally(false);
          }, 3000);

          // Update jury progress to reflect the new question
          if (juryMember && !juryMember.hasFinishedEvaluating) {
            updateJuryMutation.mutate({
              currentQuestion: newQuestionNumber,
              hasFinishedEvaluating: false,
            });
          }
        }
      }
    }
  }, [participant?.activeQuestion, participant?.assignedQuestions, selectedQuestion, juryMember, updateJuryMutation]);

  // Reset when jury changes
  useEffect(() => {
    if (juryId && participant?.id) {
      setSelectedQuestion(1);
      setQuestionChangedExternally(false);
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
    setQuestionChangedExternally(false); // Clear external change indicator when user manually changes

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
    questionChangedExternally,
    setSelectedQuestion,
    handleQuestionChange,
    handleDone,
    updateJuryMutation,
  };
};
