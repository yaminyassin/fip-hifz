import { Button } from "@/components/shadcn/button";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useMutation } from "@tanstack/react-query";
import { updateActiveQuestion } from "@/services/participants";
import React from "react";
// TODO: Import useToast if you want notifications
// import { useToast } from "@/components/shadcn/use-toast";

export function FloatingAdminActions() {
  const { t } = useTranslation();
  const { data: activeParticipant } = useActiveParticipant();

  const updateActiveQuestionMutation = useMutation({
    mutationFn: ({
      participantId,
      pageNumber,
    }: {
      participantId: string;
      pageNumber: number;
    }) => updateActiveQuestion(participantId, pageNumber),
    onSuccess: (_, variables) => {
      console.log(
        `Successfully updated active question to ${variables.pageNumber} for participant ${variables.participantId}. Cache update handled by listeners.`
      );
      // Optional: Success Toast
    },
    onError: (error, variables) => {
      console.error(
        `Error updating active question to ${variables.pageNumber} for participant ${variables.participantId}:`,
        error
      );
      // Optional: Error Toast
    },
  });

  const { currentIndex, totalQuestions, prevPage, nextPage } =
    React.useMemo(() => {
      if (
        !activeParticipant ||
        !activeParticipant.assignedQuestions ||
        activeParticipant.assignedQuestions.length === 0
      ) {
        return {
          currentIndex: -1,
          totalQuestions: 0,
          prevPage: null,
          nextPage: null,
        };
      }
      const questions = activeParticipant.assignedQuestions;
      const currentActivePage = activeParticipant.activeQuestion;
      const idx = questions.indexOf(currentActivePage);

      return {
        currentIndex: idx,
        totalQuestions: questions.length,
        prevPage: idx > 0 ? questions[idx - 1] : null,
        nextPage: idx < questions.length - 1 ? questions[idx + 1] : null,
      };
    }, [activeParticipant]);

  const handleNavigateQuestion = (pageNumber: number | null) => {
    if (pageNumber !== null && activeParticipant?.id) {
      updateActiveQuestionMutation.mutate({
        participantId: activeParticipant.id,
        pageNumber,
      });
    }
  };

  const showNavigation = activeParticipant && totalQuestions > 0;

  if (!showNavigation) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 items-end">
      <div className="flex space-x-2 p-2 bg-background/80 backdrop-blur-sm rounded-md border shadow-md">
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleNavigateQuestion(prevPage)}
          disabled={prevPage === null || updateActiveQuestionMutation.isPending}
          aria-label={t("admin.actions.prevQuestion", "Previous Question")}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center justify-center px-3 text-sm font-medium text-muted-foreground">
          {currentIndex !== -1
            ? `${currentIndex + 1} / ${totalQuestions}`
            : `- / -`}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => handleNavigateQuestion(nextPage)}
          disabled={nextPage === null || updateActiveQuestionMutation.isPending}
          aria-label={t("admin.actions.nextQuestion", "Next Question")}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
