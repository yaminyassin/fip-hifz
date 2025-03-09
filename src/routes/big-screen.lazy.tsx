import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
    <div className="min-h-screen bg-gradient-to-b from-primary to-primary/50 p-6">
      <div className="max-w-[1800px] mx-auto h-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
          {/* Left side - Participant info */}
          <div className="flex flex-col gap-6 h-full">
            {/* Participant image */}
            <div className="bg-white rounded-lg border-2 border-slate-800 overflow-hidden shadow-lg flex items-center justify-center flex-grow">
              <div className="w-3/4 h-full flex items-center justify-center bg-slate-100 py-8">
                {isLoadingParticipant ? (
                  <div className="text-center text-slate-500">
                    {t("common.loading")}
                  </div>
                ) : participant ? (
                  <div className="flex items-center justify-center w-full h-full">
                    <User className="h-48 w-48 text-slate-300" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <User className="h-48 w-48 text-slate-200 opacity-50" />
                  </div>
                )}
              </div>
            </div>

            {/* Participant details */}
            <div className="bg-white rounded-lg border-2 border-slate-800 p-6 shadow-lg">
              {isLoadingParticipant ? (
                <div className="text-center text-slate-500">
                  {t("common.loading")}
                </div>
              ) : participant ? (
                <div className="space-y-4">
                  {/* Participant header with flag and name */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold">{participant.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg">{participant.country}</span>
                        {participant.flag && (
                          <span className="text-2xl">{participant.flag}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-lg font-semibold">
                        {t("participants.age")}: {participant.age}
                      </div>
                      <div className="text-lg">
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
                      <div className="font-medium text-lg">
                        {participant.school || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 font-medium">
                        {t("participants.questions")}
                      </div>
                      <div className="font-medium text-lg">
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
                        <div className="font-bold text-lg">
                          {participant.name.split(" ")[0]}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-slate-500 font-medium">
                          Juz
                        </div>
                        <div className="font-bold text-lg">1 - 20</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-slate-500 font-medium">
                          Age
                        </div>
                        <div className="font-bold text-lg">
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
          <div className="flex flex-col gap-4 items-center h-full">
            <div className="bg-white rounded-lg border-2 border-slate-800 p-4 shadow-lg w-4/5 flex-grow">
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
                className="flex items-center gap-2 px-6 py-2 text-lg"
                variant="outline"
              >
                <ChevronLeft className="h-5 w-5" />
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
                className="flex items-center gap-2 px-6 py-2 text-lg"
                variant="outline"
              >
                {t("common.next")}
                <ChevronRight className="h-5 w-5" />
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
