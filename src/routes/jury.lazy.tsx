import { Button } from "@/components/shadcn/button";
import { ScoreInput } from "@/components/ui/ScoreInput";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useScores } from "@/hooks/useScores";
import { QuranViewer } from "@/components/ui/QuranViewer";
import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { updateJuryProgress, getJuryMember } from "../services/jury";
import { getAuthenticatedJury, clearAuthenticatedJury } from "@/services/juryAuth";
import { JuryLogin } from "@/components/ui/JuryLogin";

import { QuestionFields } from "../models/models";
import { Card } from "../components/shadcn/card";
import { ParticipantBanner } from "../components/ui/ParticipantBanner";
import { useToast } from "@/components/shadcn/use-toast";

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const { data: participant } = useActiveParticipant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication on mount and when auth state changes
  useEffect(() => {
    const juryId = getAuthenticatedJury();
    setIsAuthenticated(!!juryId);
  }, []);

  const juryId = getAuthenticatedJury();

  const { data: juryMember } = useQuery({
    queryKey: ["jury", juryId],
    queryFn: () => getJuryMember(juryId || ""),
    enabled: !!juryId,
  });

  const currentPage = participant?.assignedQuestions[selectedQuestion - 1];

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

  const handleQuestionChange = (questionNumber: number) => {
    setSelectedQuestion(questionNumber);
    updateJuryMutation.mutate({
      currentQuestion: questionNumber,
      hasFinishedEvaluating: false,
    });
  };

  const handleDone = async () => {
    const isLastQuestion = selectedQuestion === 3;

    if (isLastQuestion) {
      updateJuryMutation.mutate({
        currentQuestion: selectedQuestion,
        hasFinishedEvaluating: true,
      });
      toast({
        title: "Evaluation Complete",
        description: "You have completed evaluating all questions for this participant.",
      });
    } else {
      const nextQuestion = selectedQuestion + 1;
      setSelectedQuestion(nextQuestion);
      updateJuryMutation.mutate({
        currentQuestion: nextQuestion,
        hasFinishedEvaluating: false,
      });
      toast({
        title: "Question Complete",
        description: `Moving to Question ${nextQuestion}`,
      });
    }
  };

  const handleLogout = () => {
    clearAuthenticatedJury();
    setIsAuthenticated(false);
    queryClient.clear();
    navigate({ to: "/" });
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <JuryLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-400">
      {/* Header with logout */}
      <div className="bg-white shadow-md p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Jury Panel</h1>
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
            Logout
          </Button>
        </div>
      </div>

      <div className="flex flex-row px-4 flex-grow">
        <div className="flex flex-col w-4/6">
          <div className="p-4 space-y-4 flex-grow">
            <ParticipantBanner />
            <h2 className="text-2xl font-bold mb-4">
              Question {selectedQuestion} - Page
              {" " + participant?.assignedQuestions[selectedQuestion - 1]}
            </h2>

            <ScoreCategory
              title="Hifz"
              labels={["Reminder", "Assisted"]}
              fields={["hifz_reminder", "hifz_assistance"]}
              juryId={juryId || ""}
              participantId={participant?.id}
              questionNumber={selectedQuestion}
            />
            <ScoreCategory
              title="Tajweed"
              labels={["Minor Mistakes", "Major Mistakes"]}
              fields={["tajweed_minor", "tajweed_major"]}
              juryId={juryId || ""}
              participantId={participant?.id}
              questionNumber={selectedQuestion}
            />
            <ScoreCategory
              title="Fluency"
              labels={["Fluency"]}
              fields={["fluency"]}
              juryId={juryId || ""}
              participantId={participant?.id}
              questionNumber={selectedQuestion}
            />

            {/* Bottom Navigation Bar */}
            <div className="flex flex-row items-center bg-gray-300 p-4 gap-4 mt-auto">
              <div className="flex flex-row gap-4">
                {[1, 2, 3].map((q) => (
                  <Button
                    key={q}
                    className={`h-12 w-20 rounded-lg ${selectedQuestion === q
                      ? "bg-blue-600 hover:bg-blue-500"
                      : "bg-gray-600 hover:bg-gray-500"
                      } text-white font-bold transition-colors`}
                    onClick={() => handleQuestionChange(q)}
                    disabled={updateJuryMutation.isPending}
                  >
                    Q{q}
                  </Button>
                ))}
              </div>
              <div className="flex-grow" />
              <Button
                className="h-12 px-6 rounded-lg bg-green-600 text-white font-bold hover:bg-green-500 transition-colors disabled:bg-gray-400"
                onClick={handleDone}
                disabled={
                  !participant?.id ||
                  updateJuryMutation.isPending ||
                  (juryMember?.hasFinishedEvaluating && selectedQuestion === 3)
                }
              >
                {updateJuryMutation.isPending
                  ? "Saving..."
                  : juryMember?.hasFinishedEvaluating && selectedQuestion === 3
                    ? "Completed"
                    : "Done"}
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
  juryId: string;
  participantId?: string;
  questionNumber: number;
}

export const ScoreCategory = ({
  title,
  labels,
  fields,
  juryId,
  participantId,
  questionNumber,
}: ScoreCategoryProps) => {
  const { data: scores, isLoading } = useScores({
    juryId,
    participantId,
    questionNumber,
  });

  if (isLoading) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="flex gap-4">
          {fields.map((field) => (
            <Card key={field} className="w-36 p-2 animate-pulse">
              <div className="flex flex-col gap-y-4 justify-center">
                <div className="flex text-center justify-center w-full">
                  <div className="h-4 w-20 bg-muted rounded" />
                </div>
                <div className="flex justify-center flex-row gap-2">
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="flex gap-4">
        {fields.map((field, index) => (
          <ScoreInput
            key={field}
            label={labels[index]}
            field={field}
            juryId={juryId}
            participantId={participantId}
            questionNumber={questionNumber}
            initialScore={scores?.scores?.[field] ?? 0}
          />
        ))}
      </div>
    </Card>
  );
};
