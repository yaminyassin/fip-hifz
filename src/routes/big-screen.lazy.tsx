import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { QuranViewer } from "@/components/ui/QuranViewer";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EvaluationConfigGate } from "@/components/EvaluationConfigGate";
import { LiveUpdatesBanner } from "@/components/ui/LiveUpdatesBanner";
import { useEvent } from "@/contexts/EventContext";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";

/**
 * The category's overall range for the big-screen info box: a Juz range when
 * the config's question slots carry `sourceJuzRange`, otherwise the page span.
 * Returns null when the participant's category is absent from the config.
 */
function categoryRangeDisplay(
  config: EventEvaluationConfigV2 | null,
  categoryId: string
): { kind: "juz" | "pages"; value: string } | null {
  const slots = config?.categories[categoryId]?.questionSlots;
  if (!slots || slots.length === 0) return null;
  if (slots.every((s) => s.sourceJuzRange)) {
    const start = Math.min(...slots.map((s) => s.sourceJuzRange!.start));
    const end = Math.max(...slots.map((s) => s.sourceJuzRange!.end));
    return { kind: "juz", value: `${start} - ${end}` };
  }
  const start = Math.min(...slots.map((s) => s.pageRange.startPage));
  const end = Math.max(...slots.map((s) => s.pageRange.endPage));
  return { kind: "pages", value: `${start} - ${end}` };
}

const BigScreen = () => {
  const { t } = useTranslation();
  const { evaluationConfig } = useEvent();
  const { data: participant, isLoading: isLoadingParticipant } =
    useActiveParticipant();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [imageContainerHeight, setImageContainerHeight] = useState<number>(0);

  // State for Quran Viewer page navigation
  const [viewerPage, setViewerPage] = useState<number | undefined>(undefined);

  // Update container height on resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const height = window.innerHeight - 48; // 48px for padding (24px top + 24px bottom)
        setContainerHeight(height);
        // Calculate image container height (approximately 60% of available height)
        // Leave space for participant details (around 40% of height)
        setImageContainerHeight(Math.floor(height * 0.6) - 24); // 24px for gap
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  // Sync viewerPage with participant's activeQuestion
  useEffect(() => {
    const activeQuestionPage = participant?.activeQuestion;
    if (activeQuestionPage !== undefined) {
      setViewerPage(activeQuestionPage);
    } else {
      setViewerPage(undefined);
    }
  }, [participant?.activeQuestion]); // Depend only on activeQuestion

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

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-gray-200 p-6 overflow-hidden"
      style={{ height: `${containerHeight}px` }}
    >
      <div className="max-w-[1800px] mx-auto h-full">
        {/* Toasts are suppressed on this route (projector), so a dead listener
            has to be reported on the page itself. The audience variant is
            fixed-position and takes no layout space, which matters here: this
            container is sized to `innerHeight - 48` with `overflow-hidden` and
            the grid below claims `h-full`, so a flow element would push the
            bottom of the Quran viewer off the screen. */}
        <LiveUpdatesBanner variant="audience" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
          {/* Left side - Participant info */}
          <div className="flex flex-col gap-6 h-full overflow-hidden">
            {/* Participant image */}
            <div
              className="bg-white rounded-lg border-2 border-slate-800 overflow-hidden shadow-lg flex items-center justify-center"
              style={{ height: `${imageContainerHeight}px` }}
            >
              <div className="w-3/4 h-full flex items-center justify-center bg-slate-100 p-4">
                {isLoadingParticipant ? (
                  <div className="text-center text-slate-500">
                    {t("common.loading")}
                  </div>
                ) : participant ? (
                  participant.photo ? (
                    <img
                      src={`data:image/jpeg;base64,${participant.photo}`}
                      alt={participant.name}
                      className="max-w-full max-h-full object-contain"
                      style={{ maxHeight: `${imageContainerHeight - 32}px` }} // 32px for padding
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                      <User className="h-48 w-48 text-slate-300 md:h-32 md:w-32 lg:h-40 lg:w-40 xl:h-48 xl:w-48" />
                      <p className="mt-4 text-slate-500 text-center">
                        No photo available
                      </p>
                    </div>
                  )
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <User className="h-48 w-48 text-slate-200 opacity-50 md:h-32 md:w-32 lg:h-40 lg:w-40 xl:h-48 xl:w-48" />
                  </div>
                )}
              </div>
            </div>

            {/* Participant details */}
            <div className="bg-white rounded-lg border-2 border-slate-800 p-4 md:p-6 shadow-lg overflow-auto flex-grow">
              {isLoadingParticipant ? (
                <div className="text-center text-slate-500">
                  {t("common.loading")}
                </div>
              ) : participant ? (
                <div className="space-y-4">
                  {/* Participant header with flag and name */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl md:text-2xl font-bold">
                        {participant.name}
                      </h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-base md:text-lg">
                          {participant.country}
                        </span>
                        {participant.flag && (
                          <span className="text-xl md:text-2xl">
                            {participant.flag}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-base md:text-lg font-semibold">
                        {t("participants.banner.age")}: {participant.age}
                      </div>
                      <div className="text-base md:text-lg">
                        {t("participants.banner.category")}:{" "}
                        {participant.category}
                      </div>
                    </div>
                  </div>

                  {/* Participant details in a styled box */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                    <div>
                      <div className="text-sm text-slate-500 font-medium">
                        {t("participants.table.school")}
                      </div>
                      <div className="font-medium text-base md:text-lg">
                        {participant.school || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 font-medium">
                        {t("participants.table.questions")}
                      </div>
                      <div className="font-medium text-base md:text-lg">
                        {participant.assignedQuestions?.join(", ") || "-"}
                      </div>
                    </div>
                  </div>

                  {/* Competition info box */}
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-sm text-slate-500 font-medium">
                          Hafiz
                        </div>
                        <div className="font-bold text-base md:text-lg">
                          {participant.name.split(" ")[0]}
                        </div>
                      </div>
                      {(() => {
                        const range = categoryRangeDisplay(
                          evaluationConfig,
                          participant.category
                        );
                        return (
                          <div className="text-center">
                            <div className="text-sm text-slate-500 font-medium">
                              {range?.kind === "pages"
                                ? t("bigScreen.pages", "Pages")
                                : t("bigScreen.juz", "Juz")}
                            </div>
                            <div className="font-bold text-base md:text-lg">
                              {range?.value ?? "-"}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="text-center">
                        <div className="text-sm text-slate-500 font-medium">
                          Age
                        </div>
                        <div className="font-bold text-base md:text-lg">
                          {participant.age}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500 py-8">
                  {t("participants.banner.noParticipant")}
                </div>
              )}
            </div>
          </div>

          {/* Right side - Quran viewer */}
          <div className="flex flex-col gap-4 items-center h-full overflow-hidden">
            {/* Quran Viewer */}
            <div className="flex-grow overflow-hidden">
              <QuranViewer
                pageNumber={viewerPage ?? 1} // Default to 1 if undefined
                questionNumber={
                  displayQuestionIndex > 0 ? displayQuestionIndex : undefined
                } // Pass 1-based index or undefined
                hasAssignedQuestions={hasAssignedQuestions}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RouteComponent = () => (
  <EvaluationConfigGate>
    <BigScreen />
  </EvaluationConfigGate>
);

export const Route = createLazyFileRoute("/big-screen")({
  component: RouteComponent,
});
