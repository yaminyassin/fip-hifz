import { Button } from "@/components/shadcn/button";
import { ScoreInput } from "@/components/ui/ScoreInput";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
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

import { QuranViewer } from "@/components/ui/QuranViewer";
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

const defaultScores: QuestionFields = {
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
  // Overall Bonus
  overall_bonus: 0,
};

interface ScoreCategoryProps {
  title: string;
  subtitle?: string;
  labels: string[];
  fields: (keyof QuestionFields)[];
  scores: QuestionFields;
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
              value={scores[field]}
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
  const [currentScores, setCurrentScores] =
    useState<QuestionFields>(defaultScores);
  const [allScores, setAllScores] = useState<{
    [questionNumber: number]: QuestionFields;
  }>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  const { data: initialParticipant } = useActiveParticipant();
  const [viewerPage, setViewerPage] = useState<number | undefined>(
    initialParticipant?.assignedQuestions?.[0] ?? 1
  );

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
      setCurrentScores(defaultScores);
      setAllScores({});
      setSelectedQuestion(1);

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

  // Reset all scores when participant changes
  useEffect(() => {
    if (participant?.id && participant.id !== lastParticipantId && juryId) {
      console.log("Participant changed, resetting scores");

      // Reset scores when a new participant is selected
      setCurrentScores(defaultScores);
      setAllScores({});
      setSelectedQuestion(1); // Reset to question 1
      setLastParticipantId(participant.id);

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
      setCurrentScores(defaultScores);
      setAllScores({});
      setSelectedQuestion(1);

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
  ]);

  /**
   * Clear all previous scores for this participant and jury member
   * This handles both the old and new document ID formats
   */
  const clearPreviousScores = async (participantId: string, juryId: string) => {
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
  };

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
        const scoresByQuestion: { [questionNumber: number]: QuestionFields } =
          {};

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
            scoresByQuestion[currentQuestionNumber] = { ...defaultScores };
          }

          // Merge scores from all jury members (using the highest value for each field)
          Object.keys(data.scores).forEach((key) => {
            const fieldKey = key as keyof QuestionFields;
            const newValue = data.scores[fieldKey];

            // Use scores from the current jury
            scoresByQuestion[currentQuestionNumber][fieldKey] = newValue ?? 0; // Ensure value is not undefined
          });
        });

        setAllScores(scoresByQuestion);
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
        ...defaultScores, // Start with defaults to ensure all fields are present
        ...allScores[selectedQuestion], // Override with saved scores
      });
    } else {
      // Reset scores to default for a new/unsaved question
      setCurrentScores(defaultScores);
    }
  }, [selectedQuestion, allScores]);

  // Memoized calculation to track which questions have SAVED scores (after Done button)
  const questionsWithSavedScores = useMemo(() => {
    const result = new Set<number>();

    // Only consider questions that exist in allScores (these are saved scores)
    Object.keys(allScores).forEach((key) => {
      const qNum = parseInt(key);
      if (!isNaN(qNum)) {
        // Only add questions that have actual scores (not just default values)
        const scores = allScores[qNum];
        const hasRealScores = Object.entries(scores).some(([key, value]) => {
          // Check only error fields (not husn_al_ada or bonus)
          if (key === "husn_al_ada_score" || key === "overall_bonus")
            return false;
          return value !== defaultScores[key as keyof QuestionFields];
        });

        if (hasRealScores) {
          result.add(qNum);
        }
      }
    });

    return result;
  }, [allScores]);

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
  });

  const handleScoreChange = (field: keyof QuestionFields, value: number) => {
    let cappedValue = value;

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

    // Cap overall_bonus between 0 and 3
    if (field === "overall_bonus") {
      cappedValue = Math.min(3, Math.max(0, value));
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
    }

    // Update normally for all fields (including capped ones)
    setCurrentScores((prev) => ({
      ...prev,
      [field]: Math.max(0, cappedValue), // Ensure non-negative count for errors
    }));
  };

  // Updated handleDone logic
  const handleDone = async () => {
    if (!participant?.assignedQuestions || !juryId) return;

    const isLastQuestion =
      selectedQuestion === participant.assignedQuestions.length;

    try {
      // 1. Save the current question's scores
      await saveScoresMutation.mutateAsync(
        {
          questionNumToSave: selectedQuestion,
          scoresToSave: currentScores,
        },
        {
          onSuccess: () => {
            // 2. Update local state immediately after successful save
            setAllScores((prev) => ({
              ...prev,
              [selectedQuestion]: currentScores,
            }));

            // 3. Update jury progress marker in Firestore
            // Progress marker moves forward, but UI doesn't navigate
            const nextProgressQuestion = isLastQuestion
              ? selectedQuestion
              : selectedQuestion + 1;
            updateJuryMutation.mutate(
              {
                currentQuestion: nextProgressQuestion,
                hasFinishedEvaluating: isLastQuestion,
              },
              {
                onSuccess: () => {
                  // 4. Show appropriate toast
                  if (isLastQuestion) {
                    toast({
                      title: t("jury.messages.evaluationComplete"),
                      description: t(
                        "jury.messages.evaluationCompleteDescDone"
                      ), // New key needed
                    });
                  } else {
                    toast({
                      title: t("jury.messages.questionScoresSavedTitle"), // New key needed
                      description: t("jury.messages.questionScoresSavedDesc", {
                        number: selectedQuestion,
                      }), // New key needed
                    });
                  }
                  // 5. Invalidate queries to refresh jury state if needed
                  queryClient.invalidateQueries({ queryKey: ["juryScores"] });
                  queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
                  queryClient.refetchQueries({ queryKey: ["jury", juryId] });

                  // 6. Do NOT navigate or reset currentScores
                  // setSelectedQuestion(nextQuestion);
                  // setCurrentScores(defaultScores);
                },
                onError: (error) => {
                  console.error("Error updating jury progress:", error);
                  toast({
                    title: t("common.error"),
                    description: t("jury.messages.errorUpdatingProgress"),
                    variant: "destructive",
                  }); // New key needed
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
              description: t("jury.messages.errorSavingScores"), // Keep existing key
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

  // Updated handleQuestionChange with save-on-navigate logic
  const handleQuestionChange = async (questionNumber: number) => {
    const previousQuestion = selectedQuestion;
    const previousScores = currentScores;
    const savedScores = allScores[previousQuestion];

    // Check if scores changed for the previous question
    const scoresChanged =
      JSON.stringify(previousScores) !==
      JSON.stringify(savedScores ?? defaultScores);

    // 1. Save previous question's scores if they changed
    if (scoresChanged && participant?.id) {
      console.log(`Scores changed for Q${previousQuestion}, saving...`);
      // Update allScores locally immediately to reflect the intent to save
      setAllScores((prev) => ({ ...prev, [previousQuestion]: previousScores }));

      saveScoresMutation.mutate(
        { questionNumToSave: previousQuestion, scoresToSave: previousScores },
        {
          onSuccess: () => {
            console.log(
              `Scores saved successfully for Q${previousQuestion} on navigation.`
            );
            // Optional: confirmation toast (might be too noisy)
            // toast({
            //   title: t("jury.messages.scoresSavedTitle"),
            //   description: t("jury.messages.scoresSavedNavDesc", { number: previousQuestion }),
            // });
            // Re-sync questionsWithSavedScores (though it should update via allScores)
            queryClient.invalidateQueries({ queryKey: ["juryScores"] });
          },
          onError: (error) => {
            console.error(
              `Error saving scores for Q${previousQuestion} on navigation:`,
              error
            );
            // Revert local state if save fails?
            setAllScores((prev) => ({
              ...prev,
              [previousQuestion]: savedScores ?? defaultScores,
            }));
            toast({
              title: t("common.error"),
              description: t("jury.messages.errorSavingScoresNav", {
                number: previousQuestion,
              }),
              variant: "destructive",
            });
          },
        }
      );
    }

    // 2. Update selected question state
    setSelectedQuestion(questionNumber);

    // 3. Update jury progress in Firestore (current question marker)
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
  useEffect(() => {
    if (
      participant &&
      participant.assignedQuestions &&
      participant.assignedQuestions.length >= selectedQuestion
    ) {
      const currentPage = participant.assignedQuestions[selectedQuestion - 1];
      setViewerPage(currentPage);
    } else {
      setViewerPage(1);
    }
  }, [participant, selectedQuestion]);

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
        <div className="flex flex-col w-4/6">
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
                  const hifdhMistakeSum =
                    currentScores.hifdh_judge_correction +
                    currentScores.hifdh_self_correction +
                    currentScores.hifdh_stuck_count;
                  const hifdhWarningClass =
                    hifdhMistakeSum >= 4 ? "border-2 border-red-500" : "";

                  return (
                    <div className="grid grid-cols-2 gap-4">
                      {participant?.assignedQuestions &&
                      participant.assignedQuestions.length > 0 ? (
                        <>
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
                            scores={currentScores}
                            onScoreChange={handleScoreChange}
                            cols={2} // Use 2 columns for Tajweed
                          />
                          {/* Waqf & Ibtida Section */}
                          <ScoreCategory
                            title={t("jury.categories.waqf")}
                            subtitle={`${getSectionWeight("waqf")} ${t("jury.categories.deduction")}`}
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
                          {/* Combined Performance & Bonus Section */}
                          <ScoreCategory
                            title={t("jury.categories.performance_bonus")}
                            subtitle={`${getSectionWeight("husn_al_ada")} ${t("jury.categories.performance")}`}
                            labels={[
                              t("jury.categories.husn_al_ada_score"),
                              // t("jury.categories.overall_bonus"),
                            ]}
                            fields={[
                              "husn_al_ada_score",
                              // "overall_bonus"
                            ]}
                            scores={currentScores}
                            onScoreChange={handleScoreChange}
                            cols={1} // Use 2 columns
                          />
                        </>
                      ) : (
                        // Disabled state - update fields and labels
                        <>
                          {/* Hifdh Section (Disabled) - Apply conditional class */}
                          <ScoreCategory
                            title={t("jury.categories.hifdh")}
                            subtitle={`${getSectionWeight("hifdh")} ${t("jury.categories.deduction")}`}
                            labels={[
                              t("jury.categories.hifdh_judge_correction"),
                              t("jury.categories.hifdh_self_correction"),
                              t("jury.categories.hifdh_stuck_count"),
                            ]}
                            fields={[
                              "hifdh_judge_correction",
                              "hifdh_self_correction",
                            ]}
                            scores={defaultScores}
                            onScoreChange={() => {}}
                            disabled={true}
                            cols={2}
                            className={hifdhWarningClass}
                          />
                          <ScoreCategory
                            title={t("jury.categories.tajweed")}
                            subtitle={`${getSectionWeight("tajweed")} ${t("jury.categories.deduction")}`}
                            labels={[
                              t("jury.categories.tajweed_major"),
                              t("jury.categories.tajweed_minor"),
                            ]}
                            fields={["tajweed_major", "tajweed_minor"]}
                            scores={defaultScores}
                            onScoreChange={() => {}}
                            disabled={true}
                            cols={2}
                          />
                          <ScoreCategory
                            title={t("jury.categories.waqf")}
                            subtitle={`${getSectionWeight("waqf")} ${t("jury.categories.deduction")}`}
                            labels={[
                              t("jury.categories.waqf_ibtida_incorrect"),
                              t("jury.categories.waqf_ibtida_meaning"),
                            ]}
                            fields={[
                              "waqf_ibtida_incorrect",
                              "waqf_ibtida_meaning",
                            ]}
                            scores={defaultScores}
                            onScoreChange={() => {}}
                            disabled={true}
                            cols={2}
                          />
                          {/* Combined Performance & Bonus Section (Disabled) */}
                          <ScoreCategory
                            title={t("jury.categories.performance_bonus")}
                            subtitle={`${getSectionWeight("husn_al_ada")} ${t("jury.categories.performance")} + ${getSectionWeight("overall_bonus")} ${t("jury.categories.bonus")}`}
                            labels={[
                              t("jury.categories.husn_al_ada_score"),
                              t("jury.categories.overall_bonus"),
                            ]}
                            fields={["husn_al_ada_score", "overall_bonus"]}
                            scores={defaultScores}
                            onScoreChange={() => {}}
                            disabled={true}
                            cols={2} // Use 2 columns
                          />
                        </>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            <JuryBottomNav
              participant={participant}
              selectedQuestion={selectedQuestion}
              questionsWithSavedScores={questionsWithSavedScores}
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

        <div className="flex flex-col w-2/6 overflow-hidden">
          {/* Quran Viewer - Always render */}
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
      </div>
    </div>
  );
}

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});
