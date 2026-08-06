import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { updateJuryProgress } from "../services/jury";
import { useEvent } from "../contexts/EventContext";
import { dismissNotification, notifyError, NOTIFY_KEYS } from "@/lib/notify";
import type { AdjustmentValueMap, QuestionValueMap } from "@/evaluation/scoringEngine";

/**
 * Why Finish was refused. `incomplete` is the hard block: concluding with an
 * unscored question would drop this jury from the participant's average
 * entirely (useParticipants.ts skips any jury missing a question), producing a
 * quietly-wrong ranking with no error anywhere.
 */
export type JuryFinishError =
  | { kind: "incomplete"; missingQuestions: number[] }
  | { kind: "failed"; message: string };

/**
 * The 1-based question numbers for a category that have NO persisted score.
 *
 * Two things this deliberately does not do:
 *
 * - It does not read `assignedQuestions.length`. That array is written by the
 *   randomizer one element at a time, so a partially-written assignment would
 *   shrink the expected question count and make an incomplete evaluation look
 *   complete. `config.categories[categoryId].questionCount` is the contract.
 *
 * - It does not look at the score VALUES. A question a juror deliberately
 *   scored 0 has a stored document whose value map is all zeros; that is a
 *   real score. Only the absence of the entry counts as missing.
 */
export function findUnscoredQuestions(
  categoryQuestionCount: number,
  persistedScores: Readonly<Record<number, unknown>>,
  alsoScored: readonly number[] = []
): number[] {
  const scored = new Set<number>(alsoScored);
  for (const [key, value] of Object.entries(persistedScores)) {
    if (value === undefined || value === null) continue;
    const questionNumber = Number(key);
    if (Number.isInteger(questionNumber)) scored.add(questionNumber);
  }

  const missing: number[] = [];
  for (let questionNumber = 1; questionNumber <= categoryQuestionCount; questionNumber++) {
    if (!scored.has(questionNumber)) missing.push(questionNumber);
  }
  return missing;
}

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
    scoresToSave: QuestionValueMap;
  }) => Promise<void>;
}

interface SaveAdjustmentMutation {
  mutateAsync: (values: AdjustmentValueMap) => Promise<void>;
}

interface UseJuryNavigationProps {
  participant: Participant | null;
  juryMember: Jury | null;
  juryId: string | null;
  debounceTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  saveScoresMutation: SaveScoresMutation;
  saveAdjustmentMutation: SaveAdjustmentMutation;
  currentScores: QuestionValueMap;
  adjustmentValues: AdjustmentValueMap;
  /** Scores already persisted for this (participant, jury), keyed by question. */
  allScores: Record<number, QuestionValueMap>;
  /**
   * Set when the stored scores could not be read. While it is non-null
   * `currentScores` holds the config defaults (zeros) rather than the juror's
   * marks, so concluding must be refused — see `handleDone`.
   */
  loadError: string | null;
}

export const useJuryNavigation = ({
  participant,
  juryMember,
  juryId,
  debounceTimeoutRef,
  saveScoresMutation,
  saveAdjustmentMutation,
  currentScores,
  adjustmentValues,
  allScores,
  loadError,
}: UseJuryNavigationProps) => {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const [questionChangedExternally, setQuestionChangedExternally] = useState(false);
  const [finishError, setFinishError] = useState<JuryFinishError | null>(null);
  const { currentEvent, evaluationConfig } = useEvent();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const dismissFinishError = React.useCallback(() => {
    setFinishError(null);
    dismissNotification(NOTIFY_KEYS.juryFinish);
  }, []);

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
      if (!currentEvent) throw new Error('No event selected');
      if (!juryId) return;
      await updateJuryProgress(currentEvent, juryId, currentQuestion, hasFinishedEvaluating);
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
    // Flush any pending debounced save from the previous question instead
    // of dropping it: cancel the timer, then persist the edit it would have
    // saved (currentScores already holds that edit) before switching. This
    // is awaited so the mutation's onSuccess (which clears pendingSave and
    // updates allScores) resolves before selectedQuestion changes, so
    // ScoreForm's allScores reload for the newly-selected question can
    // never race an in-flight save.
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;

      if (juryId && participant?.id) {
        try {
          await saveScoresMutation.mutateAsync({
            questionNumToSave: selectedQuestion,
            scoresToSave: currentScores,
          });
        } catch (error) {
          console.error("Error flushing pending score save on question change:", error);
        }
      }
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

  const failFinish = (message: string) => {
    setFinishError({ kind: "failed", message });
    notifyError({
      key: NOTIFY_KEYS.juryFinish,
      title: t("jury.messages.finishBlockedTitle"),
      description: t("jury.messages.finishFailedDesc", { reason: message }),
    });
  };

  /**
   * Concluding an evaluation is a one-way door for the ranking, so it is
   * gated three times: the pending writes must land, every question in the
   * category must have a persisted score, and only then is the jury marked
   * finished. Previously all three failure modes were a bare console.error
   * and the jury was marked done regardless — an incomplete jury is then
   * silently dropped from the participant's average by useParticipants.ts.
   */
  const handleDone = async () => {
    if (!participant?.assignedQuestions || !juryId) return;

    setFinishError(null);
    dismissNotification(NOTIFY_KEYS.juryFinish);

    // The Finish button is already disabled while the read is broken
    // (ScoreForm -> QuestionTabs), but this is the write itself, so it refuses
    // independently: with `loadError` set, `currentScores` is the config
    // defaults, and the save below would put zeros over the stored marks.
    if (loadError !== null) {
      console.error("Cannot conclude evaluation: stored scores unreadable:", loadError);
      failFinish(loadError);
      return;
    }

    const category = evaluationConfig?.categories[participant.category];
    if (!category) {
      const message = t("jury.messages.unknownCategory", { category: participant.category });
      console.error("Cannot conclude evaluation:", message);
      failFinish(message);
      return;
    }

    try {
      // Save the current question's scores and the participant-level
      // adjustments (e.g. overall bonus) before marking the evaluation done.
      await Promise.all([
        saveScoresMutation.mutateAsync({
          questionNumToSave: selectedQuestion,
          scoresToSave: currentScores,
        }),
        saveAdjustmentMutation.mutateAsync(adjustmentValues),
      ]);
    } catch (error) {
      console.error("Error saving scores while concluding evaluation:", error);
      failFinish(error instanceof Error ? error.message : String(error));
      return;
    }

    // `allScores` is the render-time snapshot, so it does not yet contain the
    // question we just saved above — pass it explicitly rather than waiting a
    // render for the mutation's onSuccess to land.
    const missingQuestions = findUnscoredQuestions(category.questionCount, allScores, [
      selectedQuestion,
    ]);
    if (missingQuestions.length > 0) {
      console.error(
        `Refusing to conclude evaluation: questions ${missingQuestions.join(", ")} have no saved score`
      );
      setFinishError({ kind: "incomplete", missingQuestions });
      notifyError({
        key: NOTIFY_KEYS.juryFinish,
        title: t("jury.messages.finishBlockedTitle"),
        description: t("jury.messages.finishBlockedDesc", {
          questions: missingQuestions.join(", "),
          count: missingQuestions.length,
        }),
      });
      return;
    }

    try {
      await updateJuryMutation.mutateAsync({
        currentQuestion: category.questionCount,
        hasFinishedEvaluating: true,
      });
    } catch (error) {
      console.error("Error marking the evaluation finished:", error);
      failFinish(error instanceof Error ? error.message : String(error));
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
    finishError,
    dismissFinishError,
  };
};
