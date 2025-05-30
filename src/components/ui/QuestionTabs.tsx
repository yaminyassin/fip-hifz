import { useTranslation } from "react-i18next";
import { Button } from "@/components/shadcn/button";
import { createScoreIfNotExists } from "@/services/scores";

interface Participant {
  id: string;
  name: string;
  age: number;
  category: string;
  assignedQuestions?: number[];
  isActive?: boolean;
}

interface Jury {
  id: string;
  name: string;
  currentQuestion: number;
  hasFinishedEvaluating: boolean;
}

interface QuestionTabsProps {
  participant: Participant | null;
  juryMember: Jury | null;
  selectedQuestion: number;
  onQuestionChange: (questionNumber: number) => void;
  onDone: () => void;
  isSaving: boolean;
  disabled?: boolean;
}

export const QuestionTabs = ({
  participant,
  juryMember,
  selectedQuestion,
  onQuestionChange,
  onDone,
  isSaving,
  disabled = false,
}: QuestionTabsProps) => {
  const { t } = useTranslation();

  if (
    !participant?.assignedQuestions ||
    participant.assignedQuestions.length === 0
  ) {
    return (
      <div className="flex justify-between items-center py-8">
        <div className="text-center text-gray-500 flex-grow">
          {t("jury.noQuestionsAssigned")}
        </div>
        <Button
          className="bg-gray-400 text-white font-bold cursor-not-allowed"
          onClick={onDone}
          disabled={true}
        >
          Finish
        </Button>
      </div>
    );
  }

  const handleTabClick = (questionNumber: number) => {
    if (disabled) return;

    // Only disable navigation when jury has finished evaluating
    const isDisabled = juryMember?.hasFinishedEvaluating === true;
    if (isDisabled) return;

    // Check if score document exists for this question, create if not
    const checkAndCreateScore = async () => {
      if (participant?.id && juryMember?.id && participant.assignedQuestions) {
        const pageNumber = participant.assignedQuestions[questionNumber - 1];
        if (pageNumber) {
          try {
            await createScoreIfNotExists(
              participant.id,
              juryMember.id,
              questionNumber,
              pageNumber
            );
          } catch (error) {
            console.error("Error creating score document:", error);
          }
        }
      }
    };

    // Create score document in background and navigate to question
    checkAndCreateScore();
    onQuestionChange(questionNumber);
  };

  // Determine if the evaluation is complete
  const isEvaluationComplete = juryMember?.hasFinishedEvaluating === true;

  // Determine if button should be disabled
  const isButtonDisabled =
    !participant?.id ||
    !participant?.assignedQuestions ||
    participant.assignedQuestions.length === 0 ||
    isSaving ||
    isEvaluationComplete;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center">
        {/* Question Tabs */}
        <div className="flex flex-wrap gap-2">
          {Array.from(
            { length: participant.assignedQuestions.length },
            (_, i) => {
              const questionNumber = i + 1;
              const pageNumber = participant.assignedQuestions![i];
              const isSelected = selectedQuestion === questionNumber;

              // Only disable when jury has finished evaluating
              const isDisabled = juryMember?.hasFinishedEvaluating === true;

              return (
                <Button
                  key={questionNumber}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="min-w-[80px]"
                  onClick={() => handleTabClick(questionNumber)}
                  disabled={disabled || isDisabled}
                >
                  <div className="flex flex-col items-center">
                    <span className="text-xs">Q{questionNumber}</span>
                    <span className="text-xs opacity-75">
                      {t("jury.page")} {pageNumber}
                    </span>
                  </div>
                </Button>
              );
            }
          )}
        </div>

        {/* Finish Button */}
        <Button
          className={`font-bold transition-colors ${
            isButtonDisabled
              ? "bg-gray-400 text-white cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-800"
          }`}
          onClick={onDone}
          disabled={isButtonDisabled}
        >
          {isSaving
            ? "Saving..."
            : isEvaluationComplete
              ? "Completed"
              : "Finish"}
        </Button>
      </div>
    </div>
  );
};
