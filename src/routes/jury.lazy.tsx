import { Button } from "@/components/shadcn/button";
import { ScoreInput } from "@/components/ui/ScoreInput";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { firestore } from "@/main";

import { QuranViewer } from "@/components/ui/QuranViewer";
import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { updateJuryProgress, getJuryMember } from "../services/jury";
import { getAuthenticatedJury, clearAuthenticatedJury } from "@/services/juryAuth";
import { JuryLogin } from "@/components/ui/JuryLogin";

import { QuestionFields, Jury } from "../models/models";
import { Card } from "../components/shadcn/card";
import { ParticipantBanner } from "../components/ui/ParticipantBanner";
import { useToast } from "@/components/shadcn/use-toast";

const defaultScores: QuestionFields = {
  hifz_reminder: 0,
  hifz_assistance: 0,
  tajweed_minor: 0,
  tajweed_major: 0,
  fluency: 0,
};

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const [currentScores, setCurrentScores] = useState<QuestionFields>(defaultScores);
  const { data: participant } = useActiveParticipant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { t } = useTranslation();

  // Check authentication on mount and when auth state changes
  useEffect(() => {
    const juryId = getAuthenticatedJury();
    setIsAuthenticated(!!juryId);
  }, []);

  const juryId = getAuthenticatedJury();

  const { data: juryMember } = useQuery<Jury | null>({
    queryKey: ["jury", juryId],
    queryFn: () => getJuryMember(juryId || ""),
    enabled: !!juryId,
  });

  const currentPage = participant?.assignedQuestions?.[selectedQuestion - 1];

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

  const saveScoresMutation = useMutation({
    mutationFn: async () => {
      if (!juryId || !participant) return;

      const scoreRef = doc(
        firestore,
        "scores",
        `${participant.id}_${juryId}_${selectedQuestion}`
      );

      await setDoc(
        scoreRef,
        {
          participantId: participant.id,
          juryId,
          questionNumber: selectedQuestion,
          scores: currentScores,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    },
  });

  const handleScoreChange = (field: keyof QuestionFields, value: number) => {
    setCurrentScores(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDone = async () => {
    const isLastQuestion = selectedQuestion === 3;

    try {
      // First save the scores
      await saveScoresMutation.mutateAsync();

      // Then update jury progress
      if (isLastQuestion) {
        updateJuryMutation.mutate({
          currentQuestion: selectedQuestion,
          hasFinishedEvaluating: true,
        });
        toast({
          title: t("jury.messages.evaluationComplete"),
          description: t("jury.messages.evaluationCompleteDesc"),
        });
      } else {
        const nextQuestion = selectedQuestion + 1;
        setSelectedQuestion(nextQuestion);
        // Reset scores for next question
        setCurrentScores(defaultScores);
        updateJuryMutation.mutate({
          currentQuestion: nextQuestion,
          hasFinishedEvaluating: false,
        });
        toast({
          title: t("jury.messages.questionComplete"),
          description: t("jury.messages.movingToQuestion", { number: nextQuestion }),
        });
      }

      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("jury.messages.errorSavingScores"),
        variant: "destructive",
      });
    }
  };

  const handleQuestionChange = (questionNumber: number) => {
    setSelectedQuestion(questionNumber);
    setCurrentScores(defaultScores);
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
                  labels={[t("jury.categories.hifz_reminder"), t("jury.categories.hifz_assistance")]}
                  fields={["hifz_reminder", "hifz_assistance"]}
                  scores={currentScores}
                  onScoreChange={handleScoreChange}
                />
                <ScoreCategory
                  title={t("jury.categories.tajweed")}
                  labels={[t("jury.categories.tajweed_minor"), t("jury.categories.tajweed_major")]}
                  fields={["tajweed_minor", "tajweed_major"]}
                  scores={currentScores}
                  onScoreChange={handleScoreChange}
                />
                <ScoreCategory
                  title={t("jury.categories.fluency")}
                  labels={[t("jury.categories.fluency")]}
                  fields={["fluency"]}
                  scores={currentScores}
                  onScoreChange={handleScoreChange}
                />
              </>
            )}

            {/* Bottom Navigation Bar */}
            <div className="flex flex-row items-center bg-gray-300 p-4 gap-4 mt-auto">
              <div className="flex flex-row gap-4">
                {[1, 2, 3].map((q) => {
                  const isCompleted = (juryMember?.currentQuestion ?? 0) > q ||
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
                  (juryMember?.hasFinishedEvaluating === true && selectedQuestion === 3)
                }
              >
                {updateJuryMutation.isPending || saveScoresMutation.isPending
                  ? t("jury.actions.saving")
                  : juryMember?.hasFinishedEvaluating && selectedQuestion === 3
                    ? t("jury.actions.completed")
                    : t("jury.actions.done")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-2/6">
          <QuranViewer pageNumber={currentPage} />
        </div>
      </div>
    </div>
  );
}

interface ScoreCategoryProps {
  title: string;
  labels: string[];
  fields: (keyof QuestionFields)[];
  scores: QuestionFields;
  onScoreChange: (field: keyof QuestionFields, value: number) => void;
}

export const ScoreCategory = ({
  title,
  labels,
  fields,
  scores,
  onScoreChange,
}: ScoreCategoryProps) => {
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="flex gap-4">
        {fields.map((field, index) => (
          <ScoreInput
            key={field}
            label={labels[index]}
            field={field}
            value={scores[field]}
            onChange={(value) => onScoreChange(field, value)}
          />
        ))}
      </div>
    </Card>
  );
};
