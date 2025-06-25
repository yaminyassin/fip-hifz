import { Button } from "@/components/shadcn/button";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useMutation } from "@tanstack/react-query";
import { updateActiveQuestion } from "@/services/participants";
import { useEvent } from "@/contexts/EventContext";
import { cn } from "@/lib/utils";
import React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/main";
import { Card } from "@/components/shadcn/card";
import { Participant } from "@/models/models";

type DisplayStatus = "Active" | "Inactive" | "Completed";

export function FloatingAdminPanel() {
  const { t } = useTranslation();
  const { data: activeParticipant } = useActiveParticipant();
  const { currentEvent } = useEvent();

  // Scene Management State
  const { currentIndex, totalQuestions, prevPage, nextPage } =
    React.useMemo(() => {
      if (!activeParticipant?.assignedQuestions?.length) {
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

  // Mutations
  const updateActiveQuestionMutation = useMutation({
    mutationFn: ({
      participantId,
      pageNumber,
    }: {
      participantId: string;
      pageNumber: number;
    }) => updateActiveQuestion(currentEvent || 'lisbon-2025', participantId, pageNumber),
  });

  const markParticipantDoneMutation = useMutation({
    mutationFn: async (participantId: string) => {
      if (!participantId) return;
      const participantRef = doc(firestore, "events", currentEvent || 'lisbon-2025', "participants", participantId);
      await updateDoc(participantRef, {
        isActive: false,
        isDone: true,
      });
    },
  });

  // Handlers
  const handleNavigateQuestion = (pageNumber: number | null) => {
    if (pageNumber !== null && activeParticipant?.id) {
      updateActiveQuestionMutation.mutate({
        participantId: activeParticipant.id,
        pageNumber,
      });
    }
  };

  const handleMarkDone = (participantId: string) => {
    markParticipantDoneMutation.mutate(participantId);
  };

  // Helper functions
  const getStatusClasses = (status: DisplayStatus): string => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Completed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  const getParticipantDisplayStatus = (
    participant: Participant | null | undefined
  ): { status: DisplayStatus; text: string } => {
    if (!participant) return { status: "Inactive", text: "" };
    if (participant.isDone)
      return { status: "Completed", text: t("common.completed") };
    if (participant.isActive)
      return { status: "Active", text: t("common.active") };
    return { status: "Inactive", text: t("common.inactive") };
  };

  if (!activeParticipant) return null;

  const displayStatus = getParticipantDisplayStatus(activeParticipant);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96">
      <Card className="p-4 bg-background/95 backdrop-blur-sm shadow-lg">
        {/* Participant Details Section */}
        <div className="mb-4 pb-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">
              {activeParticipant.name || t("common.unnamed")}
            </h3>
            <span
              className={cn(
                "px-2 py-1 rounded-full text-xs font-medium",
                getStatusClasses(displayStatus.status)
              )}
            >
              {displayStatus.text}
            </span>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              {t("admin.participant.category")}:{" "}
              {activeParticipant.category || "-"}
            </div>
            <div>
              {t("admin.participant.age")}: {activeParticipant.age || "-"}
            </div>
          </div>
        </div>

        {/* Scene Management Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">{t("admin.sceneControl")}</h4>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => handleMarkDone(activeParticipant.id)}
              disabled={markParticipantDoneMutation.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t("common.markDone")}
            </Button>
          </div>

          <div className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleNavigateQuestion(prevPage)}
              disabled={
                prevPage === null || updateActiveQuestionMutation.isPending
              }
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex flex-col items-center px-3">
              <span className="text-sm font-medium">
                {t("admin.question")} {currentIndex + 1} / {totalQuestions}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("admin.page")} {activeParticipant.activeQuestion}
              </span>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => handleNavigateQuestion(nextPage)}
              disabled={
                nextPage === null || updateActiveQuestionMutation.isPending
              }
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
