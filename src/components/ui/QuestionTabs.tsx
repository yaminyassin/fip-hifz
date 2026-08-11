import { useTranslation } from "react-i18next";
import { Button } from "@/components/shadcn/button";
import { useEvent } from "@/contexts/EventContext";

interface Participant {
  id: string;
  name: string;
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
  questionChangedExternally: boolean;
  isViewingActiveQuestion: boolean;
  activeQuestionNumber: number | null;
  onQuestionChange: (questionNumber: number) => void;
  onDone: () => void;
  onGoToActiveQuestion: () => void;
  isSaving: boolean;
  disabled?: boolean;
}

/**
 * Tab count = `config.categories[participant.category].questionCount`
 * (design doc §4) — never `participant.assignedQuestions.length` alone,
 * so a category is always fully represented even before every page has
 * been randomized. A participant whose category is missing from
 * `config.categories` surfaces as an explicit error, never a silent drop.
 */
export const QuestionTabs = ({
  participant,
  juryMember,
  selectedQuestion,
  questionChangedExternally,
  isViewingActiveQuestion,
  activeQuestionNumber,
  onQuestionChange,
  onDone,
  onGoToActiveQuestion,
  isSaving,
  disabled = false,
}: QuestionTabsProps) => {
  const { t } = useTranslation();
  const { evaluationConfig } = useEvent();

  if (!participant) {
    return (
      <div className="flex justify-between items-center py-8">
        <div className="text-center text-gray-500 flex-grow">
          {t("jury.noQuestionsAssigned")}
        </div>
      </div>
    );
  }

  const category = evaluationConfig?.categories[participant.category];
  if (!category) {
    return (
      <div className="flex justify-between items-center py-8">
        <div className="text-center text-red-600 font-medium flex-grow">
          {t(
            "jury.messages.unknownCategory",
            'Participant category "{{category}}" is not defined in this event\'s config.',
            { category: participant.category }
          )}
        </div>
      </div>
    );
  }

  const questionCount = category.questionCount;

  const handleTabClick = (questionNumber: number) => {
    if (disabled) return;
    const isDisabled = juryMember?.hasFinishedEvaluating === true;
    if (isDisabled) return;
    onQuestionChange(questionNumber);
  };

  const isEvaluationComplete = juryMember?.hasFinishedEvaluating === true;
  // `disabled` carries the load-failure lock from ScoreForm. It MUST gate
  // Finish, not just the tabs: Finish writes `currentScores` to Firestore
  // (useJuryNavigation.handleDone), and while the stored scores are unreadable
  // `currentScores` holds the config defaults (zeros) rather than the juror's
  // real marks — concluding would overwrite the persisted score with zeros.
  const isButtonDisabled =
    disabled || !participant?.id || questionCount === 0 || isSaving || isEvaluationComplete;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center">
        {/* Question Tabs */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: questionCount }, (_, i) => {
            const questionNumber = i + 1;
            const pageNumber = participant.assignedQuestions?.[i];
            const isSelected = selectedQuestion === questionNumber;
            const isDisabled = juryMember?.hasFinishedEvaluating === true;

            return (
              <Button
                key={questionNumber}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                className="min-w-[72px] px-2"
                onClick={() => handleTabClick(questionNumber)}
                disabled={disabled || isDisabled}
              >
                <div className="flex flex-col items-center">
                  <span className="text-xs">Q{questionNumber}</span>
                  <span className="text-xs opacity-75">
                    {pageNumber ? `${t("jury.page")} ${pageNumber}` : "..."}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>

        {/* Question Change Notification or Active Question Indicator */}
        {questionChangedExternally && (
          <div className="flex items-center bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-4 py-2 mx-4 shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-blue-700 font-medium text-sm">
                {t("jury.messages.questionChangedTo", "Question changed to {{question}}", { question: selectedQuestion })}
              </span>
            </div>
          </div>
        )}

        {/* Active Question Indicator - Show when not viewing active question and no external change notification */}
        {!questionChangedExternally && !isViewingActiveQuestion && activeQuestionNumber && (
          <div
            className="flex items-center bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg px-4 py-2 mx-4 shadow-sm cursor-pointer hover:bg-gradient-to-r hover:from-amber-100 hover:to-orange-100 transition-colors"
            onClick={onGoToActiveQuestion}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onGoToActiveQuestion();
              }
            }}
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
              <span className="text-amber-700 font-medium text-sm">
                {t("jury.messages.goToActiveQuestion", "Go to active question {{question}}", { question: activeQuestionNumber })}
              </span>
            </div>
          </div>
        )}

        {/* Finish Button */}
        <Button
          className={`font-bold transition-colors ${isButtonDisabled
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
