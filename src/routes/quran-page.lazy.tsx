import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { QuranViewer } from "@/components/ui/QuranViewer";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useTranslation } from "react-i18next";
import { Loader2, BookOpen, User } from "lucide-react";
import { LiveUpdatesBanner } from "@/components/ui/LiveUpdatesBanner";

const QuranPageContent = () => {
  const { t } = useTranslation();
  const { data: participant, isLoading: isLoadingParticipant } =
    useActiveParticipant();

  // State for Quran Viewer page navigation
  const [viewerPage, setViewerPage] = useState<number | undefined>(undefined);

  // Sync viewerPage with participant's activeQuestion
  useEffect(() => {
    const activeQuestionPage = participant?.activeQuestion;
    if (activeQuestionPage !== undefined) {
      setViewerPage(activeQuestionPage);
    } else {
      setViewerPage(undefined);
    }
  }, [participant?.activeQuestion]);

  // Calculate current question index based on activeQuestion
  const { currentQuestionIndex, totalQuestions } = useMemo(() => {
    if (
      !participant?.assignedQuestions ||
      participant.assignedQuestions.length === 0 ||
      participant.activeQuestion === undefined
    ) {
      return { currentQuestionIndex: -1, totalQuestions: 0 };
    }
    const idx = participant.assignedQuestions.indexOf(
      participant.activeQuestion
    );
    return {
      currentQuestionIndex: idx, // Will be -1 if activeQuestion isn't in assignedQuestions
      totalQuestions: participant.assignedQuestions.length,
    };
  }, [participant?.assignedQuestions, participant?.activeQuestion]);

  const hasAssignedQuestions = totalQuestions > 0;
  const displayQuestionIndex = currentQuestionIndex + 1; // For display (1-based)

  // Loading state
  if (isLoadingParticipant) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-lg text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // No participant state
  if (!participant) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="mx-auto w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center">
            <User className="h-12 w-12 text-slate-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-700">
              {t("quranPage.noParticipant.title", "No Active Participant")}
            </h2>
            <p className="text-muted-foreground">
              {t(
                "quranPage.noParticipant.description",
                "Please select an active participant to view the Quran page."
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No active question state
  if (!viewerPage) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <BookOpen className="h-12 w-12 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-700">
              {t("quranPage.noQuestion.title", "No Active Question")}
            </h2>
            <p className="text-muted-foreground">
              {t(
                "quranPage.noQuestion.description",
                "Waiting for a question to be assigned to the participant."
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <div className="max-w-7xl mx-auto h-full">
        {/* Header with participant info */}
        <div className="mb-6 bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-800">
                  {participant.name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("quranPage.category", "Category")}: {participant.category}
                  {hasAssignedQuestions && (
                    <>
                      {" "}
                      • {t("quranPage.question", "Question")}{" "}
                      {displayQuestionIndex}/{totalQuestions}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-slate-800">
                {t("quranPage.page", "Page")} {viewerPage}
              </div>
              <div className="text-sm text-muted-foreground">
                {participant.country} {participant.flag}
              </div>
            </div>
          </div>
        </div>

        {/* Quran Viewer */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div
            className="h-full"
            style={{
              height: "calc(100vh - 180px)", // Account for header and padding
              minHeight: "600px",
            }}
          >
            <QuranViewer
              pageNumber={viewerPage}
              questionNumber={
                displayQuestionIndex > 0 ? displayQuestionIndex : undefined
              }
              hasAssignedQuestions={hasAssignedQuestions}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * The disconnect badge sits ABOVE the content, not inside it. `QuranPageContent`
 * returns early for loading / no participant / no active question, and a
 * listener that dies before its first snapshot produces exactly those states —
 * the calm "No Active Participant" screen would otherwise be the only thing on
 * the projector while the connection is dead. Toasts are suppressed on this
 * route, so this is the sole surface.
 */
const QuranPage = () => (
  <>
    <LiveUpdatesBanner variant="audience" />
    <QuranPageContent />
  </>
);

export const Route = createLazyFileRoute("/quran-page")({
  component: QuranPage,
});
