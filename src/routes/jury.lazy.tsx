import { Button } from "@/components/shadcn/button";
import { ScoreInput } from "@/components/ui/ScoreInput";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/main";

import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { updateJuryProgress, getJuryMember } from "../services/jury";
import {
  getAuthenticatedJury,
  clearAuthenticatedJury,
} from "@/services/juryAuth";
import { JuryLogin } from "@/components/ui/JuryLogin";
import { getErrorPenalty, getSectionWeight } from "@/utils/scoreUtils";

import { QuestionFields, Jury } from "../models/models";
import { Card } from "../components/shadcn/card";
import { ParticipantBanner } from "../components/ui/ParticipantBanner";
import { useToast } from "@/components/shadcn/use-toast";
import { JuryBottomNav } from "../components/ui/JuryBottomNav";

// Define a type for scores that don't include overall_bonus
type QuestionOnlyFields = Omit<QuestionFields, "overall_bonus">;

// Define default scores for question-specific fields
const defaultQuestionScores: QuestionOnlyFields = {
  // Hifdh
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0,
  // Tajweed
  tajweed_major: 0,
  tajweed_minor: 0,
  // Waqf & Ibtida
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  // Husn al-Ada
  husn_al_ada_score: 0,
};

interface ScoreCategoryProps {
  title: string;
  subtitle?: string;
  labels: string[];
  fields: (keyof QuestionFields)[];
  scores: Partial<QuestionFields>;
  onScoreChange: (field: keyof QuestionFields, value: number) => void;
  disabled?: boolean;
  cols?: number;
  className?: string;
}

export const ScoreCategory = ({
  title,
  subtitle,
  labels,
  fields,
  scores,
  onScoreChange,
  disabled = false,
  cols = 3,
  className = "",
}: ScoreCategoryProps) => {
  // Remove unused t variable
  // const { t } = useTranslation();

  // Determine grid class based on cols prop
  const gridColsClass = `grid-cols-${cols}`;

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex flex-col mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle && (
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>
      <div className={`grid ${gridColsClass} gap-4`}>
        {fields.map((field, index) => (
          <div key={field} className="flex flex-col items-center">
            <ScoreInput
              label={labels[index]}
              field={field}
              value={scores[field] ?? 0}
              onChange={(value) => onScoreChange(field, value)}
              disabled={disabled}
            />
            <span className="text-xs text-center mt-1 font-medium text-muted-foreground w-full">
              {getErrorPenalty(field)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

function RouteComponent() {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const [currentScores, setCurrentScores] = useState<QuestionOnlyFields>(
    defaultQuestionScores
  );
  const [allScores, setAllScores] = useState<{
    [questionNumber: number]: QuestionOnlyFields;
  }>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [overallBonus, setOverallBonus] = useState<number>(0); // New state for overall_bonus

  // Keep track of the last participant ID to detect changes
  const [lastParticipantId, setLastParticipantId] = useState<string | null>(
    null
  );

  // Track the participant's assigned questions for change detection
  const previousQuestionsRef = useRef<string>("");

  const { data: participant } = useActiveParticipant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Added for debouncing score saves

  // Check authentication on mount and when auth state changes
  useEffect(() => {
    const juryId = getAuthenticatedJury();
    setIsAuthenticated(!!juryId);
  }, []);

  const juryId = getAuthenticatedJury();

  // Listen for jury ID changes and refresh data
  useEffect(() => {
    if (juryId && participant?.id) {
      console.log(
        `Jury ID changed to ${juryId}, refreshing data for participant ${participant.id}`
      );
      // Reset scores when jury changes
      setCurrentScores(defaultQuestionScores);
      setAllScores({});
      setSelectedQuestion(1);
      setOverallBonus(0); // Reset overall bonus

      // Invalidate and reload data
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
      queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
    }
  }, [juryId, queryClient, participant?.id]);

  const { data: juryMember } = useQuery<Jury | null>({
    queryKey: ["jury", juryId],
    queryFn: () => getJuryMember(juryId || ""),
    enabled: !!juryId,
  });

  // Track the current assigned questions to detect changes
  const currentQuestionsKey = participant?.assignedQuestions?.join(",") || "";

  // Define updateJuryMutation first before using it in effects
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
      queryClient.invalidateQueries({ queryKey: ["jury"] });
    },
  });

  /**
   * Clear all previous scores for this participant and jury member
   * This handles both the old and new document ID formats
   */
  const clearPreviousScores = useCallback(
    async (participantId: string, juryId: string) => {
      try {
        // Get all score documents for this participant and jury
        const scoresRef = collection(firestore, "scores");
        const q = query(
          scoresRef,
          where("participantId", "==", participantId),
          where("juryId", "==", juryId)
        );

        const snapshot = await getDocs(q);

        // Delete each score document
        const deletePromises = snapshot.docs.map((doc) => {
          return deleteDoc(doc.ref);
        });

        await Promise.all(deletePromises);

        // Reset jury progress directly in the database
        const juryRef = doc(firestore, "jury", juryId);
        await updateDoc(juryRef, {
          currentQuestion: 1,
          hasFinishedEvaluating: false,
        });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ["juryScores"] });
        queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
        queryClient.refetchQueries({ queryKey: ["jury", juryId] });

        console.log(
          `Cleared ${deletePromises.length} previous scores for participant ${participantId}`
        );
        toast({
          title: t("jury.messages.scoreReset"),
          description: t("jury.messages.scoreResetDesc"),
        });
      } catch (error) {
        console.error("Error clearing previous scores:", error);
      }
    },
    [t, queryClient, toast]
  );

  // Reset all scores when participant changes
  useEffect(() => {
    if (participant?.id && participant.id !== lastParticipantId && juryId) {
      console.log("Participant changed, resetting scores");

      // Reset scores when a new participant is selected
      setCurrentScores(defaultQuestionScores);
      setAllScores({});
      setSelectedQuestion(1); // Reset to question 1
      setLastParticipantId(participant.id);
      setOverallBonus(0); // Reset overall bonus

      // Also reset the jury progress if needed
      if (
        juryMember &&
        (juryMember.currentQuestion > 1 || juryMember.hasFinishedEvaluating)
      ) {
        updateJuryMutation.mutate(
          {
            currentQuestion: 1,
            hasFinishedEvaluating: false,
          },
          {
            onSuccess: () => {
              // Force refresh jury member data
              queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
              queryClient.refetchQueries({ queryKey: ["jury", juryId] });
            },
          }
        );
      }
    }
  }, [
    participant?.id,
    lastParticipantId,
    juryId,
    juryMember,
    updateJuryMutation,
    queryClient,
  ]);

  // Detect when questions have been reassigned to the same participant
  useEffect(() => {
    if (!participant?.id || !juryId) return;

    // Check if questions have changed for the same participant
    if (
      currentQuestionsKey &&
      previousQuestionsRef.current !== currentQuestionsKey &&
      previousQuestionsRef.current !== ""
    ) {
      console.log("Questions changed for participant, clearing old scores");

      // Reset component state
      setCurrentScores(defaultQuestionScores);
      setAllScores({});
      setSelectedQuestion(1);
      setOverallBonus(0); // Reset overall bonus

      // Reset the jury member's evaluation status FIRST to ensure UI updates correctly
      if (
        juryMember &&
        (juryMember.currentQuestion > 1 || juryMember.hasFinishedEvaluating)
      ) {
        updateJuryMutation.mutate(
          {
            currentQuestion: 1,
            hasFinishedEvaluating: false,
          },
          {
            onSuccess: () => {
              // After updating the jury status, clear old scores
              clearPreviousScores(participant.id, juryId);

              // Force refresh jury member data
              queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
              queryClient.refetchQueries({ queryKey: ["jury", juryId] });
            },
          }
        );
      } else {
        // If jury status doesn't need updating, just clear scores
        clearPreviousScores(participant.id, juryId);
      }
    }

    // Update reference to current questions
    previousQuestionsRef.current = currentQuestionsKey;
  }, [
    currentQuestionsKey,
    participant?.id,
    juryId,
    juryMember,
    updateJuryMutation,
    queryClient,
    clearPreviousScores,
  ]);

  // Get all scores for this participant from all jury members
  useEffect(() => {
    const fetchAllScores = async () => {
      if (!participant?.id || !participant.assignedQuestions?.length) return;

      console.log(
        `Fetching scores for participant ${participant.id} and jury ${juryId}`
      );

      try {
        const scoresRef = collection(firestore, "scores");
        const q = query(
          scoresRef,
          where("participantId", "==", participant.id),
          where("juryId", "==", juryId)
        );

        const snapshot = await getDocs(q);
        const scoresByQuestion: {
          [questionNumber: number]: QuestionOnlyFields;
        } = {};
        let initialOverallBonus: number | undefined = undefined;

        // Map of current assigned page numbers to detect relevant scores
        const currentPages = new Set(participant.assignedQuestions);

        snapshot.forEach((doc) => {
          const data = doc.data();
          const pageNumber = data.pageNumber;

          // Skip scores that don't belong to the current set of assigned pages
          if (pageNumber === undefined || !currentPages.has(pageNumber)) {
            return;
          }

          // Find the question number for this page in the current assignment
          const currentQuestionIndex =
            participant.assignedQuestions.indexOf(pageNumber);
          if (currentQuestionIndex === -1) {
            return; // Page not found in current assignment
          }

          const currentQuestionNumber = currentQuestionIndex + 1;

          if (!scoresByQuestion[currentQuestionNumber]) {
            scoresByQuestion[currentQuestionNumber] = {
              ...defaultQuestionScores,
            };
          }

          // Separate question scores from overall bonus
          const allFieldsFromDoc = data.scores as QuestionFields;
          const { overall_bonus: bonusFromDoc, ...questionOnlyScoresFromDoc } =
            allFieldsFromDoc;

          // Merge question-specific scores
          Object.keys(questionOnlyScoresFromDoc).forEach((key) => {
            const fieldKey = key as keyof QuestionOnlyFields;
            const newValue = questionOnlyScoresFromDoc[fieldKey];
            scoresByQuestion[currentQuestionNumber][fieldKey] = newValue ?? 0;
          });

          // Logic to determine the initialOverallBonus (e.g., from current question or first question)
          if (
            participant.assignedQuestions &&
            juryMember?.currentQuestion &&
            currentQuestionNumber === juryMember.currentQuestion &&
            bonusFromDoc !== undefined
          ) {
            initialOverallBonus = bonusFromDoc;
          } else if (
            initialOverallBonus === undefined &&
            currentQuestionNumber === 1 &&
            bonusFromDoc !== undefined
          ) {
            // Fallback to first question's bonus if current question's isn't set yet or found
            initialOverallBonus = bonusFromDoc;
          }
        });

        setAllScores(scoresByQuestion);
        setOverallBonus(initialOverallBonus ?? 0); // Set overallBonus after processing all docs
      } catch (error) {
        console.error("Error fetching all scores:", error);
      }
    };

    fetchAllScores();
  }, [participant, juryId, participant?.id]);

  // Load current scores for the selected question
  useEffect(() => {
    if (selectedQuestion && allScores[selectedQuestion]) {
      // Load all scores for the selected question
      setCurrentScores({
        ...defaultQuestionScores, // Start with defaults to ensure all fields are present
        ...allScores[selectedQuestion], // Override with saved scores for the question
      });
      // overallBonus state is NOT changed here to maintain its value across questions
    } else {
      // Reset scores to default for a new/unsaved question
      setCurrentScores(defaultQuestionScores);
      // overallBonus state is NOT changed here
    }
  }, [selectedQuestion, allScores]);

  // Modify mutationFn to accept arguments
  const saveScoresMutation = useMutation({
    mutationFn: async ({
      questionNumToSave,
      scoresToSave,
    }: {
      questionNumToSave: number;
      scoresToSave: QuestionFields;
    }) => {
      if (!juryId || !participant) return;

      // Get the actual page number being scored for the specific question
      const pageNumber = participant.assignedQuestions?.[questionNumToSave - 1];
      if (pageNumber === undefined) {
        console.error(
          `Page number not found for question ${questionNumToSave}`
        );
        throw new Error(
          `Page number not found for question ${questionNumToSave}`
        );
      }

      const scoreRef = doc(
        firestore,
        "scores",
        `${participant.id}_${juryId}_q${questionNumToSave}_p${pageNumber}` // Use specific question number
      );

      await setDoc(
        scoreRef,
        {
          participantId: participant.id,
          juryId,
          questionNumber: questionNumToSave, // Use specific question number
          pageNumber: pageNumber,
          scores: scoresToSave, // Save the passed scores
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    },
    // Note: We might want global onSuccess/onError handlers here later
    onSuccess: (_, variables) => {
      // Update allScores locally after a successful save
      // This ensures the checkmarks update correctly
      // allScores should store QuestionOnlyFields
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { overall_bonus: unused_overall_bonus, ...questionOnlyScores } =
        variables.scoresToSave;
      setAllScores((prev) => ({
        ...prev,
        [variables.questionNumToSave]: questionOnlyScores,
      }));
      // Re-validate related queries if needed, though local update might be sufficient
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
      queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
    },
    onError: (error, variables) => {
      console.error(
        `Error saving scores for Q${variables.questionNumToSave}:`,
        error
      );
      toast({
        title: t("common.error"),
        description: t("jury.messages.errorSavingScores"), // Generic error for now
        variant: "destructive",
      });
    },
  });

  const handleScoreChange = (
    receivedField: keyof QuestionFields,
    value: number
  ) => {
    // This handler is for question-specific scores. overall_bonus is handled by handleOverallBonusChange.
    if (receivedField === "overall_bonus") {
      // This path should ideally not be taken if ScoreCategory instances are set up correctly.
      // If it is, delegate to the correct handler or log an error.
      // For safety, we can call handleOverallBonusChange, though it implies a misconfiguration.
      // console.warn("handleScoreChange was called with 'overall_bonus', delegating...");
      // handleOverallBonusChange(value);
      return;
    }
    const field = receivedField as keyof QuestionOnlyFields;

    let cappedValue = value;
    let newScores: QuestionOnlyFields | null = null; // Variable to hold the potential new state

    // Cap husn_al_ada_score between 0 and 10
    if (field === "husn_al_ada_score") {
      cappedValue = Math.min(10, Math.max(0, value));
      if (value > 10 || value < 0) {
        toast({
          title: t("jury.messages.scoreCappedTitle"),
          description: t("jury.messages.scoreCappedDesc", {
            field: t("jury.categories.husn_al_ada_score"),
            min: 0,
            max: 10,
            value: cappedValue,
          }),
        });
      }
    }

    // Update normally for all fields (including capped ones)
    setCurrentScores((prev) => {
      newScores = {
        ...prev,
        [field]: Math.max(0, cappedValue), // Ensure non-negative count for errors
      };
      return newScores;
    });

    // --- Debounced Firestore Save ---
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (newScores && juryId && participant?.id) {
        console.log(
          `Debounced save triggered for Q${selectedQuestion} (question scores only)`
        );
        const scoresToSaveForQuestion: QuestionFields = {
          ...newScores, // These are QuestionOnlyFields
          overall_bonus: overallBonus, // Include the current global overallBonus
        };
        saveScoresMutation.mutate({
          questionNumToSave: selectedQuestion,
          scoresToSave: scoresToSaveForQuestion,
        });
      }
    }, 500); // Debounce time (e.g., 750ms)
  };

  const handleOverallBonusChange = (value: number) => {
    const cappedValue = Math.min(3, Math.max(0, value));
    if (value > 3 || value < 0) {
      toast({
        title: t("jury.messages.scoreCappedTitle"),
        description: t("jury.messages.scoreCappedDesc", {
          field: t("jury.categories.overall_bonus"),
          min: 0,
          max: 3,
          value: cappedValue,
        }),
      });
    }
    setOverallBonus(cappedValue);

    // Optional: If overallBonus needs to be saved immediately on change (not just with "Done" or question save)
    // This might be redundant if question saves already include it.
    // Consider if a separate debounced save is needed for overallBonus alone.
    // For now, relying on it being saved with question scores or handleDone.
  };

  // Updated handleDone logic
  const handleDone = async () => {
    if (!participant?.assignedQuestions || !juryId) return;

    const totalQuestions = participant.assignedQuestions.length; // Needed for setting final progress

    try {
      // 1. Save the current question's scores FIRST, including the overall bonus
      const finalScoresToSave: QuestionFields = {
        ...currentScores, // These are QuestionOnlyFields
        overall_bonus: overallBonus, // Include the global overallBonus
      };

      await saveScoresMutation.mutateAsync(
        {
          questionNumToSave: selectedQuestion,
          scoresToSave: finalScoresToSave,
        },
        {
          onSuccess: () => {
            // 2. Update local state immediately after successful save
            // allScores should store QuestionOnlyFields
            setAllScores((prev) => ({
              ...prev,
              [selectedQuestion]: { ...currentScores }, // Save only question scores locally
            }));

            // 3. Update jury progress marker in Firestore
            // Mark evaluation as fully finished
            updateJuryMutation.mutate(
              {
                currentQuestion: totalQuestions, // Set progress to the end
                hasFinishedEvaluating: true, // Always mark as finished now
              },
              {
                onSuccess: () => {
                  // 4. Invalidate queries to refresh jury state if needed (Toast removed previously)
                  queryClient.invalidateQueries({ queryKey: ["juryScores"] });
                  queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
                },
                onError: (error) => {
                  console.error("Error updating jury progress:", error);
                  toast({
                    title: t("common.error"),
                    description: t("jury.messages.errorUpdatingProgress"),
                    variant: "destructive",
                  }); // Keep error toast
                },
              }
            );
          },
          onError: (error) => {
            console.error(
              `Error saving scores for Q${selectedQuestion} via Done button:`,
              error
            );
            toast({
              title: t("common.error"),
              description: t("jury.messages.errorSavingScores"),
              variant: "destructive",
            });
          },
        }
      );
    } catch (error) {
      // Catch potential errors from mutateAsync itself if needed, though onError should handle mutation errors
      console.error("Error during handleDone execution:", error);
      toast({
        title: t("common.error"),
        description: t("jury.messages.errorSavingScores"),
        variant: "destructive",
      });
    }
  };

  // Updated handleQuestionChange with save-on-navigate logic REMOVED
  const handleQuestionChange = async (questionNumber: number) => {
    // const previousQuestion = selectedQuestion; // No longer needed
    // const previousScores = currentScores; // No longer needed
    // const savedScores = allScores[previousQuestion]; // No longer needed

    // // Check if scores changed for the previous question // No longer needed
    // const scoresChanged =
    //   JSON.stringify(previousScores) !==
    //   JSON.stringify(savedScores ?? defaultScores);

    // // 1. Save previous question's scores if they changed // REMOVED
    // if (scoresChanged && participant?.id) { ... } // Entire block removed

    // Clear any pending debounced save from the previous question
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null; // Reset ref
      console.log("Cleared pending save on question change.");
    }

    // 1. Update selected question state (was step 2)
    setSelectedQuestion(questionNumber);

    // 2. Update jury progress in Firestore (current question marker) (was step 3)
    if (juryMember && !juryMember.hasFinishedEvaluating) {
      // Don't update progress if already finished
      updateJuryMutation.mutate({
        currentQuestion: questionNumber,
        hasFinishedEvaluating: false, // Always false during navigation
      });
    }

    // Scores for the new question will be loaded by the useEffect watching selectedQuestion
  };

  const handleLogout = () => {
    clearAuthenticatedJury();
    setIsAuthenticated(false);
    queryClient.clear();
    navigate({ to: "/" });
  };

  // Re-added and corrected useEffect to sync viewerPage
  // useEffect(() => {
  //   if (
  //     participant &&
  //     participant.assignedQuestions &&
  //     participant.assignedQuestions.length >= selectedQuestion
  //   ) {
  //     const currentPage = participant.assignedQuestions[selectedQuestion - 1];
  //     setViewerPage(currentPage);
  //   } else {
  //     setViewerPage(1);
  //   }
  // }, [participant, selectedQuestion]);

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <JuryLogin onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-400">
      {/* Header with logout */}
      <div className="bg-white shadow-md p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">{t("jury.title")}</h1>
            {juryMember && (
              <span className="text-muted-foreground">| {juryMember.name}</span>
            )}
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="text-red-600 hover:text-red-700"
          >
            {t("jury.actions.logout")}
          </Button>
        </div>
      </div>

      <div className="flex flex-row px-4 flex-grow">
        <div className="flex flex-col w-full">
          <div className="p-4 space-y-4 flex-grow">
            <ParticipantBanner />
            <h2 className="text-2xl font-bold mb-4">
              {participant?.assignedQuestions &&
              participant.assignedQuestions.length > 0 ? (
                <>
                  {t("jury.question")} {selectedQuestion} - {t("jury.page")}{" "}
                  {participant?.assignedQuestions?.[selectedQuestion - 1]}
                </>
              ) : (
                <span className="text-gray-600">
                  {t("jury.noQuestionsAssigned")}
                </span>
              )}
            </h2>

            {participant && juryId && (
              <>
                {/* Calculate Hifdh mistakes sum */}
                {(() => {
                  const hifdhWarningClass =
                    currentScores.hifdh_judge_correction >= 4
                      ? "border-2 border-red-500"
                      : "";

                  // Determine if inputs should be disabled for the current question
                  const isQuestionDone =
                    !!juryMember &&
                    (juryMember.currentQuestion > selectedQuestion ||
                      juryMember.hasFinishedEvaluating);

                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Hifdh Section - Apply conditional class */}
                        <ScoreCategory
                          title={t("jury.categories.hifdh")}
                          subtitle={`${getSectionWeight("hifdh")} ${t("jury.categories.deduction")}`}
                          labels={[
                            t("jury.categories.hifdh_judge_correction"),
                            t("jury.categories.hifdh_self_correction"),
                          ]}
                          fields={[
                            "hifdh_judge_correction",
                            "hifdh_self_correction",
                          ]}
                          disabled={isQuestionDone}
                          scores={currentScores}
                          onScoreChange={handleScoreChange}
                          cols={2}
                          className={hifdhWarningClass}
                        />
                        {/* Tajweed Section */}
                        <ScoreCategory
                          title={t("jury.categories.tajweed")}
                          subtitle={`${getSectionWeight("tajweed")} ${t("jury.categories.deduction")}`}
                          labels={[
                            t("jury.categories.tajweed_major"),
                            t("jury.categories.tajweed_minor"),
                          ]}
                          fields={["tajweed_major", "tajweed_minor"]}
                          disabled={isQuestionDone}
                          scores={currentScores}
                          onScoreChange={handleScoreChange}
                          cols={2} // Use 2 columns for Tajweed
                        />
                        {/* Waqf & Ibtida Section */}
                        <ScoreCategory
                          title={t("jury.categories.waqf")}
                          subtitle={`${getSectionWeight("waqf")} ${t("jury.categories.deduction")}`}
                          disabled={isQuestionDone}
                          labels={[
                            t("jury.categories.waqf_ibtida_incorrect"),
                            t("jury.categories.waqf_ibtida_meaning"),
                          ]}
                          fields={[
                            "waqf_ibtida_incorrect",
                            "waqf_ibtida_meaning",
                          ]}
                          scores={currentScores}
                          onScoreChange={handleScoreChange}
                          cols={2} // Use 2 columns for Waqf
                        />
                        {/* Combined Performance */}
                        <ScoreCategory
                          title={t("jury.categories.performance_bonus")}
                          subtitle={`${getSectionWeight("husn_al_ada")} ${t("jury.categories.performance")}`}
                          labels={[t("jury.categories.husn_al_ada_score")]}
                          disabled={isQuestionDone}
                          fields={["husn_al_ada_score"]}
                          scores={currentScores}
                          onScoreChange={handleScoreChange}
                          cols={1} // Use 2 columns
                        />
                      </div>
                      <ScoreCategory
                        title={t("jury.categories.overall_bonus_title")}
                        subtitle={`${getSectionWeight("overall_bonus")}. Bonus applies to the total overall score`}
                        labels={[t("jury.categories.bonus")]}
                        disabled={isQuestionDone}
                        fields={["overall_bonus"]}
                        scores={{ overall_bonus: overallBonus }}
                        onScoreChange={(_field, val) =>
                          handleOverallBonusChange(val)
                        }
                        cols={1}
                      />
                    </>
                  );
                })()}
              </>
            )}

            <JuryBottomNav
              participant={participant}
              selectedQuestion={selectedQuestion}
              juryMember={juryMember}
              handleQuestionChange={handleQuestionChange}
              handleDone={handleDone}
              isSaving={
                updateJuryMutation.isPending || saveScoresMutation.isPending
              }
              t={t}
            />
          </div>
        </div>

        {/* 
        <div className="flex flex-col w-2/6 overflow-hidden">
          <div className="flex flex-col h-[900px]">
            <div className="flex-grow">
              <QuranViewer
                pageNumber={viewerPage ?? 1}
                questionNumber={participant ? selectedQuestion : undefined}
                hasAssignedQuestions={
                  !!(
                    participant?.assignedQuestions &&
                    participant.assignedQuestions.length > 0
                  )
                }
              />
            </div>
          </div>
        </div>
         */}
      </div>
    </div>
  );
}

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});
