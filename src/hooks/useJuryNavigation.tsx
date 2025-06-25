import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateJuryProgress } from "../services/jury";
import { useEvent } from "../contexts/EventContext";
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
  const { currentEvent } = useEvent();
  const queryClient = useQueryClient();
  
  // Track the last admin active question to detect real changes
  const lastAdminActiveQuestionRef = React.useRef<number | null>(null);

  // Calculate if jury is viewing the active question
  const isViewingActiveQuestion = React.useMemo(() => {
    if (!participant?.assignedQuestions || !participant?.activeQuestion) {
      return true; // Consider as "active" if no active question is set
    }
    
    const activeQuestionIndex = participant.assignedQuestions.indexOf(participant.activeQuestion);
    if (activeQuestionIndex === -1) {
      return true; // Active question not in assigned questions
    }
    
    const activeQuestionNumber = activeQuestionIndex + 1; // Convert to 1-based
    return selectedQuestion === activeQuestionNumber;
  }, [participant?.assignedQuestions, participant?.activeQuestion, selectedQuestion]);

  // Get the active question number for navigation
  const activeQuestionNumber = React.useMemo(() => {
    if (!participant?.assignedQuestions || !participant?.activeQuestion) {
      return null;
    }
    
    const activeQuestionIndex = participant.assignedQuestions.indexOf(participant.activeQuestion);
    if (activeQuestionIndex === -1) {
      return null;
    }
    
    return activeQuestionIndex + 1; // Convert to 1-based
  }, [participant?.assignedQuestions, participant?.activeQuestion]);

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
      await updateJuryProgress(currentEvent || 'lisbon-2025', juryId, currentQuestion, hasFinishedEvaluating);
    },
    onSuccess: () => {
      // Removed invalidateQueries for jury data since we use real-time Firebase updates
    },
  });

  // Reset question selection when participant changes
  useEffect(() => {
    if (participant?.id) {
      // Initialize to the admin's active question if it exists, otherwise question 1
      if (participant?.assignedQuestions && participant?.activeQuestion) {
        const questionIndex = participant.assignedQuestions.indexOf(participant.activeQuestion);
        if (questionIndex !== -1) {
          const initialQuestion = questionIndex + 1;
          setSelectedQuestion(initialQuestion);
          lastAdminActiveQuestionRef.current = initialQuestion;
        } else {
          setSelectedQuestion(1);
          lastAdminActiveQuestionRef.current = null;
        }
      } else {
      setSelectedQuestion(1);
        lastAdminActiveQuestionRef.current = null;
      }
      setQuestionChangedExternally(false);
    }
  }, [participant?.id]);

  // Only sync when admin actually changes the active question (not when jury navigates manually)
  useEffect(() => {
    if (participant?.assignedQuestions && participant?.activeQuestion) {
      // Find which question index corresponds to the active page
      const questionIndex = participant.assignedQuestions.indexOf(participant.activeQuestion);
      if (questionIndex !== -1) {
        const newQuestionNumber = questionIndex + 1; // Convert to 1-based
        
        // Only sync if this is a real change from the admin (not initial load or jury navigation)
        if (lastAdminActiveQuestionRef.current !== null && 
            lastAdminActiveQuestionRef.current !== newQuestionNumber) {
          console.log(`[useJuryNavigation] Admin changed question from ${lastAdminActiveQuestionRef.current} to ${newQuestionNumber} (page ${participant.activeQuestion})`);
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
        
        // Always update the ref to track the current admin active question
        lastAdminActiveQuestionRef.current = newQuestionNumber;
      }
    }
  }, [participant?.activeQuestion, participant?.assignedQuestions, juryMember, updateJuryMutation]);

  // Reset when jury changes
  useEffect(() => {
    if (juryId && participant?.id) {
      setSelectedQuestion(1);
      setQuestionChangedExternally(false);
      lastAdminActiveQuestionRef.current = null; // Reset tracking when jury changes
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

  const handleGoToActiveQuestion = () => {
    if (activeQuestionNumber) {
      handleQuestionChange(activeQuestionNumber);
    }
  };

  return {
    selectedQuestion,
    questionChangedExternally,
    isViewingActiveQuestion,
    activeQuestionNumber,
    setSelectedQuestion,
    handleQuestionChange,
    handleDone,
    handleGoToActiveQuestion,
    updateJuryMutation,
  };
};
