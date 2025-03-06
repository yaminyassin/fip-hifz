import { Button } from "@/components/shadcn/button";
import { ScoreInput } from "@/components/ui/ScoreInput";
import { ScoreSummary } from "@/components/ui/ScoreSummary";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { doc, setDoc, collection, query, where, getDocs, deleteDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/main";

import { QuranViewer } from "@/components/ui/QuranViewer";
import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { updateJuryProgress, getJuryMember } from "../services/jury";
import { getAuthenticatedJury, clearAuthenticatedJury } from "@/services/juryAuth";
import { JuryLogin } from "@/components/ui/JuryLogin";
import { getErrorPenalty, getSectionWeight, getMaxDeductionPerQuestion } from "@/utils/scoreUtils";

import { QuestionFields, Jury } from "../models/models";
import { Card } from "../components/shadcn/card";
import { ParticipantBanner } from "../components/ui/ParticipantBanner";
import { useToast } from "@/components/shadcn/use-toast";

const defaultScores: QuestionFields = {
  hifz_fath: 0,
  hifz_tannin: 0,
  hifz_taraddud: 0,
  tajweed_jali: 0,
  tajweed_khafi: 0,
  waqf_ibtida: 0,
  fluency_bonus: 0,
};

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const [currentScores, setCurrentScores] = useState<QuestionFields>(defaultScores);
  const [allScores, setAllScores] = useState<{ [questionNumber: number]: QuestionFields }>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Track global fluency bonus separately to persist across questions
  const [globalFluencyBonus, setGlobalFluencyBonus] = useState(0);
  
  // Keep track of the last participant ID to detect changes
  const [lastParticipantId, setLastParticipantId] = useState<string | null>(null);
  
  // Track the participant's assigned questions for change detection
  const previousQuestionsRef = useRef<string>('');
  
  const { data: participant } = useActiveParticipant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Determine the total number of questions
  const totalQuestions = useMemo(() => {
    return participant?.assignedQuestions?.length || 0;
  }, [participant]);
  
  const currentPage = participant?.assignedQuestions?.[selectedQuestion - 1];
  
  // Check authentication on mount and when auth state changes
  useEffect(() => {
    const juryId = getAuthenticatedJury();
    setIsAuthenticated(!!juryId);
  }, []);
  
  const juryId = getAuthenticatedJury();

  // Listen for jury ID changes and refresh data
  useEffect(() => {
    if (juryId && participant?.id) {
      console.log(`Jury ID changed to ${juryId}, refreshing data for participant ${participant.id}`);
      // Reset scores when jury changes
      setCurrentScores(defaultScores);
      setAllScores({});
      setGlobalFluencyBonus(0);
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
  const currentQuestionsKey = participant?.assignedQuestions?.join(',') || '';
  
  // Define updateJuryMutation first before using it in effects
  const updateJuryMutation = useMutation({
    mutationFn: async ({
      currentQuestion,
      hasFinishedEvaluating
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
      console.log('Participant changed, resetting scores');
      
      // Reset scores when a new participant is selected
      setCurrentScores(defaultScores);
      setAllScores({});
      setGlobalFluencyBonus(0);
      setSelectedQuestion(1); // Reset to question 1
      setLastParticipantId(participant.id);
      
      // Also reset the jury progress if needed
      if (juryMember && (juryMember.currentQuestion > 1 || juryMember.hasFinishedEvaluating)) {
        updateJuryMutation.mutate({
          currentQuestion: 1,
          hasFinishedEvaluating: false,
        }, {
          onSuccess: () => {
            // Force refresh jury member data
            queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
            queryClient.refetchQueries({ queryKey: ["jury", juryId] });
          }
        });
      }
    }
  }, [participant?.id, lastParticipantId, juryId, juryMember, updateJuryMutation, queryClient]);
  
  // Detect when questions have been reassigned to the same participant
  useEffect(() => {
    if (!participant?.id || !juryId) return;
    
    // Check if questions have changed for the same participant
    if (currentQuestionsKey && 
        previousQuestionsRef.current !== currentQuestionsKey &&
        previousQuestionsRef.current !== '') {
      console.log('Questions changed for participant, clearing old scores');
      
      // Reset component state
      setCurrentScores(defaultScores);
      setAllScores({});
      setGlobalFluencyBonus(0);
      setSelectedQuestion(1);
      
      // Reset the jury member's evaluation status FIRST to ensure UI updates correctly
      if (juryMember && (juryMember.currentQuestion > 1 || juryMember.hasFinishedEvaluating)) {
        updateJuryMutation.mutate({
          currentQuestion: 1,
          hasFinishedEvaluating: false,
        }, {
          onSuccess: () => {
            // After updating the jury status, clear old scores
            clearPreviousScores(participant.id, juryId);
            
            // Force refresh jury member data
            queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
            queryClient.refetchQueries({ queryKey: ["jury", juryId] });
          }
        });
      } else {
        // If jury status doesn't need updating, just clear scores
        clearPreviousScores(participant.id, juryId);
      }
    }
    
    // Update reference to current questions
    previousQuestionsRef.current = currentQuestionsKey;
  }, [currentQuestionsKey, participant?.id, juryId, juryMember, updateJuryMutation, queryClient]);
  
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
      const deletePromises = snapshot.docs.map(doc => {
        return deleteDoc(doc.ref);
      });
      
      await Promise.all(deletePromises);
      
      // Reset jury progress directly in the database
      const juryRef = doc(firestore, "jury", juryId);
      await updateDoc(juryRef, {
        currentQuestion: 1,
        hasFinishedEvaluating: false
      });
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
      queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
      queryClient.refetchQueries({ queryKey: ["jury", juryId] });
      
      console.log(`Cleared ${deletePromises.length} previous scores for participant ${participantId}`);
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
      
      console.log(`Fetching scores for participant ${participant.id} and jury ${juryId}`);
      
      try {
        const scoresRef = collection(firestore, "scores");
        const q = query(
          scoresRef,
          where("participantId", "==", participant.id),
          where("juryId", "==", juryId)
        );
        
        const snapshot = await getDocs(q);
        const scoresByQuestion: { [questionNumber: number]: QuestionFields } = {};
        let totalFluencyBonus = 0;
        
        // Map of current assigned page numbers to detect relevant scores
        const currentPages = new Set(participant.assignedQuestions);
        
        snapshot.forEach(doc => {
          const data = doc.data();
          const questionNumber = data.questionNumber;
          const pageNumber = data.pageNumber;
          
          // Skip scores that don't belong to the current set of assigned pages
          if (pageNumber === undefined || !currentPages.has(pageNumber)) {
            return;
          }
          
          // Find the question number for this page in the current assignment
          const currentQuestionIndex = participant.assignedQuestions.indexOf(pageNumber);
          if (currentQuestionIndex === -1) {
            return; // Page not found in current assignment
          }
          
          const currentQuestionNumber = currentQuestionIndex + 1;
          
          if (!scoresByQuestion[currentQuestionNumber]) {
            scoresByQuestion[currentQuestionNumber] = { ...defaultScores };
          }
          
          // Merge scores from all jury members (using the highest value for each field)
          Object.keys(data.scores).forEach(key => {
            const fieldKey = key as keyof QuestionFields;
            const currentValue = scoresByQuestion[currentQuestionNumber][fieldKey];
            const newValue = data.scores[fieldKey];
            
            // Only use scores from the current jury
            if (fieldKey === 'fluency_bonus') {
              totalFluencyBonus += newValue;
            } 
            // For errors, use the scores from the current jury
            else {
              scoresByQuestion[currentQuestionNumber][fieldKey] = newValue;
            }
          });
        });
        
        setAllScores(scoresByQuestion);
        setGlobalFluencyBonus(totalFluencyBonus);
      } catch (error) {
        console.error("Error fetching all scores:", error);
      }
    };
    
    fetchAllScores();
  }, [participant, juryId, participant?.id]);

  // Load current scores for the selected question
  useEffect(() => {
    if (selectedQuestion && allScores[selectedQuestion]) {
      // Keep the current fluency_bonus value
      const fluencyValue = currentScores.fluency_bonus;
      setCurrentScores({
        ...allScores[selectedQuestion],
        fluency_bonus: fluencyValue
      });
    } else {
      // Reset scores except fluency
      setCurrentScores(prev => ({
        ...defaultScores,
        fluency_bonus: prev.fluency_bonus
      }));
    }
  }, [selectedQuestion, allScores]);

  // Create a memoized version of allScores that includes the current unsaved scores
  // and properly handles the global fluency bonus
  const liveScores = useMemo(() => {
    // Make a copy of the fetched scores
    const updatedScores = { ...allScores };
    
    // Set the fluency_bonus to 0 for all questions to avoid double-counting
    Object.keys(updatedScores).forEach(questionKey => {
      const questionNum = parseInt(questionKey);
      updatedScores[questionNum] = {
        ...updatedScores[questionNum],
        fluency_bonus: 0
      };
    });
    
    // Add or update the current question's scores with the latest unsaved changes
    // but without the fluency bonus
    if (selectedQuestion) {
      const scoresWithoutFluency = { ...currentScores, fluency_bonus: 0 };
      updatedScores[selectedQuestion] = scoresWithoutFluency;
    }
    
    // For the first question, add the global fluency bonus
    // (The calculateFinalScore function will sum all fluency bonuses, so we only add it once)
    if (Object.keys(updatedScores).length > 0) {
      const firstQuestion = Math.min(...Object.keys(updatedScores).map(Number));
      updatedScores[firstQuestion] = {
        ...updatedScores[firstQuestion],
        fluency_bonus: globalFluencyBonus + currentScores.fluency_bonus
      };
    } else if (selectedQuestion) {
      // If no scores yet, create an entry for current question with just fluency
      updatedScores[selectedQuestion] = {
        ...defaultScores,
        fluency_bonus: globalFluencyBonus + currentScores.fluency_bonus
      };
    }
    
    return updatedScores;
  }, [allScores, currentScores, selectedQuestion, globalFluencyBonus]);

  // Memoized calculation to track which questions have SAVED scores (after Done button)
  const questionsWithSavedScores = useMemo(() => {
    const result = new Set<number>();
    
    // Only consider questions that exist in allScores (these are saved scores)
    Object.keys(allScores).forEach(key => {
      const qNum = parseInt(key);
      if (!isNaN(qNum)) {
        // Only add questions that have actual scores (not just default values)
        const scores = allScores[qNum];
        const hasRealScores = Object.entries(scores).some(([key, value]) => {
          if (key === 'fluency_bonus') return false; // Skip fluency as it's handled separately
          return value !== defaultScores[key as keyof QuestionFields];
        });
        
        if (hasRealScores) {
          result.add(qNum);
        }
      }
    });
    
    return result;
  }, [allScores]);

  const saveScoresMutation = useMutation({
    mutationFn: async () => {
      if (!juryId || !participant) return;

      // Get the actual page number being scored
      const pageNumber = participant.assignedQuestions?.[selectedQuestion - 1];
      if (pageNumber === undefined) return;

      // Create a unique ID that includes the page number to prevent collisions
      // when questions are reassigned
      const scoreRef = doc(
        firestore,
        "scores",
        `${participant.id}_${juryId}_q${selectedQuestion}_p${pageNumber}`
      );

      await setDoc(
        scoreRef,
        {
          participantId: participant.id,
          juryId,
          questionNumber: selectedQuestion,
          pageNumber: pageNumber, // Store the actual page number
          scores: {
            // Save all scores except fluency_bonus
            hifz_fath: currentScores.hifz_fath,
            hifz_tannin: currentScores.hifz_tannin,
            hifz_taraddud: currentScores.hifz_taraddud,
            tajweed_jali: currentScores.tajweed_jali,
            tajweed_khafi: currentScores.tajweed_khafi,
            waqf_ibtida: currentScores.waqf_ibtida,
            // Fluency bonus is stored in a separate field
            fluency_bonus: 0
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // Save the global fluency bonus to the first question
      if (currentScores.fluency_bonus > 0) {
        const newGlobalFluency = globalFluencyBonus + currentScores.fluency_bonus;
        setGlobalFluencyBonus(newGlobalFluency);

        // Get the first page number
        const firstPageNumber = participant.assignedQuestions?.[0];
        if (firstPageNumber === undefined) return;

        // Save the global fluency to question 1 with its page number
        const fluencyRef = doc(
          firestore,
          "scores",
          `${participant.id}_${juryId}_q1_p${firstPageNumber}`
        );

        await setDoc(
          fluencyRef,
          {
            participantId: participant.id,
            juryId,
            questionNumber: 1,
            pageNumber: firstPageNumber,
            scores: {
              fluency_bonus: newGlobalFluency
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true }
        );
      }
    },
  });

  const handleScoreChange = (field: keyof QuestionFields, value: number) => {
    // For fluency_bonus, cap the value at 5 minus the existing global bonus
    if (field === 'fluency_bonus') {
      const remainingFluencyAllowance = 5 - globalFluencyBonus;
      const cappedValue = Math.min(value, Math.max(0, remainingFluencyAllowance));
      
      setCurrentScores(prev => ({
        ...prev,
        [field]: cappedValue,
      }));
      
      // Show toast if value was capped
      if (value > remainingFluencyAllowance && remainingFluencyAllowance >= 0) {
        toast({
          title: t("jury.messages.fluencyCapped"),
          description: t("jury.messages.fluencyCappedDesc", { max: 5, current: globalFluencyBonus }),
        });
      }
    } else {
      // For other fields, update normally
      setCurrentScores(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const handleDone = async () => {
    if (!participant?.assignedQuestions) return;
    
    const isLastQuestion = selectedQuestion === participant.assignedQuestions.length;

    try {
      // First save the scores
      await saveScoresMutation.mutateAsync();

      // Update the allScores state with the saved scores
      setAllScores(prev => {
        const updatedScores = { ...prev };
        
        // Update current question scores (without fluency)
        updatedScores[selectedQuestion] = {
          ...currentScores,
          fluency_bonus: 0
        };
        
        // Update question 1 with the global fluency bonus
        if (updatedScores[1]) {
          updatedScores[1] = {
            ...updatedScores[1],
            fluency_bonus: globalFluencyBonus + currentScores.fluency_bonus
          };
        } else {
          updatedScores[1] = {
            ...defaultScores,
            fluency_bonus: globalFluencyBonus + currentScores.fluency_bonus
          };
        }
        
        return updatedScores;
      });

      // Then update jury progress - ensure hasFinishedEvaluating is only true for the last question
      updateJuryMutation.mutate({
        currentQuestion: isLastQuestion ? selectedQuestion : selectedQuestion + 1,
        hasFinishedEvaluating: isLastQuestion,
      }, {
        onSuccess: () => {
          // Move to next question if not on the last one
          if (!isLastQuestion) {
            const nextQuestion = selectedQuestion + 1;
            setSelectedQuestion(nextQuestion);
            // Reset scores for next question, but keep fluency
            setCurrentScores(prev => ({
              ...defaultScores,
              fluency_bonus: 0 // Reset fluency input for new question
            }));
            
            toast({
              title: t("jury.messages.questionComplete"),
              description: t("jury.messages.movingToQuestion", { number: nextQuestion }),
            });
          } else {
            toast({
              title: t("jury.messages.evaluationComplete"),
              description: t("jury.messages.evaluationCompleteDesc"),
            });
          }
          
          // Invalidate queries to refresh the data
          queryClient.invalidateQueries({ queryKey: ["juryScores"] });
          queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
          queryClient.refetchQueries({ queryKey: ["jury", juryId] });
        }
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("jury.messages.errorSavingScores"),
        variant: "destructive",
      });
    }
  };

  const handleQuestionChange = (questionNumber: number) => {
    // Save current fluency bonus value
    const currentFluency = currentScores.fluency_bonus;
    
    setSelectedQuestion(questionNumber);
    
    // Set scores for the new question, but preserve any fluency bonus input
    if (allScores[questionNumber]) {
      setCurrentScores({
        ...allScores[questionNumber],
        fluency_bonus: currentFluency
      });
    } else {
      setCurrentScores({
        ...defaultScores,
        fluency_bonus: currentFluency
      });
    }
    
    updateJuryMutation.mutate({
      currentQuestion: questionNumber,
      hasFinishedEvaluating: false,
    });
  };

  const handleLogout = () => {
    clearAuthenticatedJury();
    setIsAuthenticated(false);
    queryClient.clear();
    navigate({ to: "/" });
  };

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
              <span className="text-muted-foreground">
                | {juryMember.name}
              </span>
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
              {t("jury.question")} {selectedQuestion} - {t("jury.page")}{" "}
              {participant?.assignedQuestions?.[selectedQuestion - 1]}
            </h2>

            {participant && juryId && (
              <>
                <ScoreCategory
                  title={t("jury.categories.hifz")}
                  subtitle={`${getSectionWeight('hifz')} ${t("jury.categories.ofTotalScore")}`}
                  labels={[t("jury.categories.hifz_fath"), t("jury.categories.hifz_tannin"), t("jury.categories.hifz_taraddud")]}
                  fields={["hifz_fath", "hifz_tannin", "hifz_taraddud"]}
                  scores={currentScores}
                  onScoreChange={handleScoreChange}
                />
                <ScoreCategory
                  title={t("jury.categories.tajweed")}
                  subtitle={`${getSectionWeight('tajweed')} ${t("jury.categories.ofTotalScore")}`}
                  labels={[t("jury.categories.tajweed_jali"), t("jury.categories.tajweed_khafi")]}
                  fields={["tajweed_jali", "tajweed_khafi"]}
                  scores={currentScores}
                  onScoreChange={handleScoreChange}
                />
                <ScoreCategory
                  title={t("jury.categories.waqf")}
                  subtitle={`${getSectionWeight('waqf')} ${t("jury.categories.ofTotalScore")}`}
                  labels={[t("jury.categories.waqf_ibtida")]}
                  fields={["waqf_ibtida"]}
                  scores={currentScores}
                  onScoreChange={handleScoreChange}
                />
                <ScoreCategory
                  title={t("jury.categories.fluency")}
                  subtitle={`${getSectionWeight('fluency')} ${t("jury.messages.overallPerformance")}`}
                  labels={[t("jury.categories.fluency_bonus")]}
                  fields={["fluency_bonus"]}
                  scores={currentScores}
                  onScoreChange={handleScoreChange}
                />

                {/* Score Summary - Always show total score across all questions */}
                <div className="mt-6">
                  <ScoreSummary 
                    allScores={
                      Object.keys(liveScores).length > 0 
                        ? liveScores 
                        : { [selectedQuestion]: {...defaultScores, fluency_bonus: globalFluencyBonus} }
                    } 
                    totalQuestions={totalQuestions} 
                  />
                </div>
              </>
            )}

            {/* Bottom Navigation Bar */}
            <div className="flex flex-row items-center bg-gray-300 p-4 gap-4 mt-auto">
              <div className="flex flex-row gap-4">
                {participant?.assignedQuestions && Array.from(
                  { length: participant.assignedQuestions.length },
                  (_, i) => i + 1
                ).map((q) => {
                  // A question is considered completed ONLY if:
                  // 1. It has SAVED scores (after clicking Done)
                  // 2. OR The jury's current question is greater than q (meaning we've moved past it)
                  // 3. OR It's the current question AND hasFinishedEvaluating is true (for the last question)
                  const isCompleted = questionsWithSavedScores.has(q) || 
                                      (juryMember?.currentQuestion ?? 0) > q ||
                                      ((juryMember?.currentQuestion ?? 0) === q && juryMember?.hasFinishedEvaluating === true);
                  
                  const isCurrent = selectedQuestion === q;

                  return (
                    <div key={q} className="relative">
                      <Button
                        className={`h-12 w-20 rounded-lg ${isCompleted
                          ? "bg-green-600 hover:bg-green-500"
                          : isCurrent
                            ? "bg-blue-600 hover:bg-blue-500"
                            : "bg-gray-600 hover:bg-gray-500"
                          } text-white font-bold transition-colors relative ${isCompleted ? "opacity-90" : ""
                          }`}
                        onClick={() => handleQuestionChange(q)}
                        disabled={updateJuryMutation.isPending || saveScoresMutation.isPending}
                      >
                        Q{q}
                        {isCompleted && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg">
                            <Check className="w-6 h-6 text-white" />
                          </div>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="flex-grow" />
              <Button
                className="h-12 px-6 rounded-lg bg-green-600 text-white font-bold hover:bg-green-500 transition-colors disabled:bg-gray-400"
                onClick={handleDone}
                disabled={
                  !participant?.id ||
                  updateJuryMutation.isPending ||
                  saveScoresMutation.isPending ||
                  (juryMember?.hasFinishedEvaluating === true && 
                   participant?.assignedQuestions && 
                   selectedQuestion === participant.assignedQuestions.length)
                }
              >
                {updateJuryMutation.isPending || saveScoresMutation.isPending
                  ? t("jury.actions.saving")
                  : juryMember?.hasFinishedEvaluating && 
                    participant?.assignedQuestions && 
                    selectedQuestion === participant.assignedQuestions.length
                    ? t("jury.actions.completed")
                    : t("jury.actions.done")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-2/6 overflow-hidden">
          {/* Quran Viewer */}
          {currentPage && (
            <div className="flex h-screen overflow-hidden">
              <QuranViewer pageNumber={currentPage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ScoreCategoryProps {
  title: string;
  subtitle?: string;
  labels: string[];
  fields: (keyof QuestionFields)[];
  scores: QuestionFields;
  onScoreChange: (field: keyof QuestionFields, value: number) => void;
}

export const ScoreCategory = ({
  title,
  subtitle,
  labels,
  fields,
  scores,
  onScoreChange,
}: ScoreCategoryProps) => {
  const { t } = useTranslation();
  const { data: participant } = useActiveParticipant();
  
  // Calculate max deduction per question based on the category
  const totalQuestions = participant?.assignedQuestions?.length || 1;
  
  // Determine which section this category belongs to
  const getSectionForCategory = (categoryTitle: string): 'hifz' | 'tajweed' | 'waqf' | 'fluency' => {
    if (categoryTitle === t("jury.categories.hifz")) return 'hifz';
    if (categoryTitle === t("jury.categories.tajweed")) return 'tajweed';
    if (categoryTitle === t("jury.categories.waqf")) return 'waqf';
    return 'fluency';
  };
  
  const section = getSectionForCategory(title);
  
  // Get max deduction for this category per question (if applicable)
  const maxDeduction = section !== 'fluency' 
    ? getMaxDeductionPerQuestion(section, totalQuestions) 
    : 0;
  
  return (
    <Card className="p-4">
      <div className="flex flex-col mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle && <span className="text-sm text-muted-foreground">{subtitle}</span>}
        
        {/* Display max deduction per question if not fluency */}
        {section !== 'fluency' && (
          <span className="text-xs text-muted-foreground mt-1">
            {t("jury.categories.maxDeduction")}: {maxDeduction.toFixed(1)}% {t("jury.categories.perQuestion")}
          </span>
        )}
        
        {/* Display max fluency bonus if fluency category */}
        {section === 'fluency' && (
          <span className="text-xs text-muted-foreground mt-1">
            {t("jury.categories.maxBonus")}: +5% {t("jury.categories.total")}
          </span>
        )}
      </div>
      
      <div className="flex flex-wrap gap-4">
        {fields.map((field, index) => (
          <div key={field} className="flex flex-col">
            <ScoreInput
              label={labels[index]}
              field={field}
              value={scores[field]}
              onChange={(value) => onScoreChange(field, value)}
            />
            <span className="text-xs text-center mt-1 font-medium text-muted-foreground">
              {getErrorPenalty(field)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
