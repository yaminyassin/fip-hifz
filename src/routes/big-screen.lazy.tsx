import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { QuranViewer } from "@/components/ui/QuranViewer";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { Button } from "@/components/shadcn/button";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { useTranslation } from "react-i18next";

const BigScreen = () => {
  const { t } = useTranslation();
  const { data: participant, isLoading: isLoadingParticipant } =
    useActiveParticipant();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [imageContainerHeight, setImageContainerHeight] = useState<number>(0);

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

  const handlePreviousQuestion = () => {
    setCurrentQuestionIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleNextQuestion = () => {
    if (
      participant?.assignedQuestions &&
      currentQuestionIndex < participant.assignedQuestions.length - 1
    ) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const currentQuestionNumber =
    participant?.assignedQuestions?.[currentQuestionIndex] || 0;
  const hasAssignedQuestions = !!participant?.assignedQuestions?.length;

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-gray-200 p-6 overflow-hidden"
      style={{ height: `${containerHeight}px` }}
    >
      <div className="max-w-[1800px] mx-auto h-full">
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
            <div className="bg-white rounded-lg border-2 border-slate-800 p-4 md:p-6 shadow-lg overflow-auto">
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
                        {t("participants.age")}: {participant.age}
                      </div>
                      <div className="text-base md:text-lg">
                        {t("participants.category")}: {participant.category}
                      </div>
                    </div>
                  </div>

                  {/* Participant details in a styled box */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                    <div>
                      <div className="text-sm text-slate-500 font-medium">
                        {t("participants.school")}
                      </div>
                      <div className="font-medium text-base md:text-lg">
                        {participant.school || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 font-medium">
                        {t("participants.questions")}
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
                      <div className="text-center">
                        <div className="text-sm text-slate-500 font-medium">
                          Juz
                        </div>
                        <div className="font-bold text-base md:text-lg">
                          1 - 20
                        </div>
                      </div>
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
            <div className="bg-white rounded-lg border-2 border-slate-800 p-4 shadow-lg w-full md:w-4/5 flex-grow overflow-auto">
              <div className="mb-2 text-center">
                <div className="inline-block px-4 py-1 bg-primary/10 rounded-full text-primary font-medium">
                  Question {currentQuestionIndex + 1}
                </div>
              </div>
              <QuranViewer
                pageNumber={currentQuestionNumber}
                questionNumber={currentQuestionIndex + 1}
                hasAssignedQuestions={hasAssignedQuestions}
              />
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-center gap-4">
              <Button
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0 || !hasAssignedQuestions}
                className="flex items-center gap-2 px-4 md:px-6 py-1 md:py-2 text-base md:text-lg"
                variant="outline"
              >
                <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
                {t("common.previous")}
              </Button>

              <Button
                onClick={handleNextQuestion}
                disabled={
                  !hasAssignedQuestions ||
                  (participant?.assignedQuestions &&
                    currentQuestionIndex >=
                      participant.assignedQuestions.length - 1)
                }
                className="flex items-center gap-2 px-4 md:px-6 py-1 md:py-2 text-base md:text-lg"
                variant="outline"
              >
                {t("common.next")}
                <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/big-screen")({
  component: BigScreen,
});
