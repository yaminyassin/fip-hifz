import { Button } from "@/components/shadcn/button";
import { Participant, Jury } from "@/models/models"; // Assuming models are here
import { TFunction } from "i18next"; // Import TFunction type

interface JuryBottomNavProps {
  participant: Participant | null | undefined;
  selectedQuestion: number;
  questionsWithSavedScores: Set<number>;
  juryMember: Jury | null | undefined;
  handleQuestionChange: (questionNumber: number) => void;
  handleDone: () => void;
  isSaving: boolean;
  t: TFunction<"translation", undefined>; // Use TFunction type
}

export const JuryBottomNav = ({
  participant,
  selectedQuestion,
  questionsWithSavedScores,
  juryMember,
  handleQuestionChange,
  handleDone,
  isSaving,
  t,
}: JuryBottomNavProps) => {
  // Determine if the evaluation is fully completed (for the 'Done' button state)
  const isEvaluationComplete =
    juryMember?.hasFinishedEvaluating === true &&
    participant?.assignedQuestions &&
    selectedQuestion === participant.assignedQuestions.length;

  return (
    <div className="flex flex-row items-center bg-gray-300 p-4 gap-4 mt-auto">
      {/* Question Buttons */}
      <div className="flex flex-row gap-4">
        {participant?.assignedQuestions &&
          Array.from(
            { length: participant.assignedQuestions.length },
            (_, i) => i + 1
          ).map((q) => {
            // Completion logic using props
            const isCompleted =
              questionsWithSavedScores.has(q) ||
              (juryMember?.currentQuestion ?? 0) > q ||
              ((juryMember?.currentQuestion ?? 0) === q &&
                juryMember?.hasFinishedEvaluating === true);

            const isCurrent = selectedQuestion === q;

            return (
              <div key={q} className="relative">
                <Button
                  className={`h-12 w-20 rounded-lg ${
                    isCompleted
                      ? "bg-green-600 hover:bg-green-500"
                      : isCurrent
                        ? "bg-blue-600 hover:bg-blue-500"
                        : "bg-gray-600 hover:bg-gray-500"
                  } text-white font-bold transition-colors`}
                  onClick={() => handleQuestionChange(q)}
                  disabled={isSaving || juryMember?.hasFinishedEvaluating}
                >
                  Q{q}
                </Button>
              </div>
            );
          })}
      </div>

      {/* Spacer */}
      <div className="flex-grow" />

      {/* Done Button */}
      <Button
        className="h-12 px-6 rounded-lg bg-green-600 text-white font-bold hover:bg-green-500 transition-colors disabled:bg-gray-400"
        onClick={handleDone}
        disabled={
          !participant?.id ||
          !participant?.assignedQuestions ||
          participant.assignedQuestions.length === 0 ||
          isSaving ||
          isEvaluationComplete // Use the calculated variable
        }
      >
        {isSaving
          ? t("jury.actions.saving")
          : isEvaluationComplete
            ? t("jury.actions.completed")
            : t("jury.actions.done")}
      </Button>
    </div>
  );
};
