import { useTranslation } from "react-i18next";
import { useCallback, useEffect } from "react";
import { ScoreCategory } from "./ScoreCategory";
import { getSectionWeight } from "../../utils/scoreUtils";
import { QuestionFields } from "../../models/models";

// Define a type for scores that don't include overall_bonus
type QuestionOnlyFields = Omit<QuestionFields, "overall_bonus">;

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

interface ScoreFormProps {
  participant: Participant | null;
  juryMember: Jury | null;
  selectedQuestion: number;
  currentScores: QuestionOnlyFields;
  overallBonus: number;
  allScores: { [questionNumber: number]: QuestionOnlyFields };
  onScoreChange: (
    field: keyof QuestionFields,
    value: number,
    selectedQuestion: number
  ) => void;
  onOverallBonusChange: (value: number) => void;
  setCurrentScores: (scores: QuestionOnlyFields) => void;
  defaultQuestionScores: QuestionOnlyFields;
}

export const ScoreForm = ({
  participant,
  juryMember,
  selectedQuestion,
  currentScores,
  overallBonus,
  allScores,
  onScoreChange,
  onOverallBonusChange,
  setCurrentScores,
  defaultQuestionScores,
}: ScoreFormProps) => {
  const { t } = useTranslation();

  // Load current scores for the selected question
  useEffect(() => {
    if (selectedQuestion && allScores[selectedQuestion]) {
      setCurrentScores({
        ...defaultQuestionScores,
        ...allScores[selectedQuestion],
      });
    } else {
      setCurrentScores(defaultQuestionScores);
    }
  }, [selectedQuestion, allScores, setCurrentScores, defaultQuestionScores]);

  const handleScoreChange = useCallback(
    (field: keyof QuestionFields, value: number) =>
      onScoreChange(field, value, selectedQuestion),
    [onScoreChange, selectedQuestion]
  );

  if (!participant || !juryMember) {
    return null;
  }

  // Determine if inputs should be disabled for the current question
  const isQuestionDone =
    juryMember.currentQuestion > selectedQuestion ||
    juryMember.hasFinishedEvaluating;

  // Calculate Hifdh mistakes sum and apply warning class
  const hifdhWarningClass =
    currentScores.hifdh_judge_correction >= 4 ? "border-2 border-red-500" : "";

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">
        {participant.assignedQuestions &&
        participant.assignedQuestions.length > 0 ? (
          <>
            {t("jury.question")} {selectedQuestion} - {t("jury.page")}{" "}
            {participant.assignedQuestions[selectedQuestion - 1]}
          </>
        ) : (
          <span className="text-gray-600">{t("jury.noQuestionsAssigned")}</span>
        )}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Hifdh Section */}
        <ScoreCategory
          title={t("jury.categories.hifdh")}
          subtitle={`${getSectionWeight("hifdh")} `}
          labels={[
            t("jury.categories.hifdh_judge_correction"),
            t("jury.categories.hifdh_self_correction"),
          ]}
          fields={["hifdh_judge_correction", "hifdh_self_correction"]}
          disabled={isQuestionDone}
          scores={currentScores}
          onScoreChange={handleScoreChange}
          cols={2}
          className={hifdhWarningClass}
        />

        {/* Tajweed Section */}
        <ScoreCategory
          title={t("jury.categories.tajweed")}
          subtitle={`${getSectionWeight("tajweed")} `}
          labels={[
            t("jury.categories.tajweed_major"),
            t("jury.categories.tajweed_minor"),
          ]}
          fields={["tajweed_major", "tajweed_minor"]}
          disabled={isQuestionDone}
          scores={currentScores}
          onScoreChange={handleScoreChange}
          cols={2}
        />

        {/* Waqf & Ibtida Section */}
        <ScoreCategory
          title={t("jury.categories.waqf")}
          subtitle={`${getSectionWeight("waqf")} `}
          disabled={isQuestionDone}
          labels={[
            t("jury.categories.waqf_ibtida_incorrect"),
            t("jury.categories.waqf_ibtida_meaning"),
          ]}
          fields={["waqf_ibtida_incorrect", "waqf_ibtida_meaning"]}
          scores={currentScores}
          onScoreChange={handleScoreChange}
          cols={2}
        />

        {/* Performance Section */}
        <ScoreCategory
          title={t("jury.categories.performance_bonus")}
          subtitle={getSectionWeight("husn_al_ada")}
          labels={[t("jury.categories.husn_al_ada_mistakes_count")]}
          fields={["husn_al_ada_score"]}
          scores={currentScores}
          onScoreChange={handleScoreChange}
          disabled={isQuestionDone || !participant.isActive}
          cols={1}
        />
      </div>

      {/* Overall Bonus Section */}
      <ScoreCategory
        title={t("jury.categories.overall_bonus_title")}
        subtitle={`${getSectionWeight("overall_bonus")} ${t("jury.categories.bonus")}`}
        labels={[t("jury.categories.overall_bonus")]}
        fields={["overall_bonus"]}
        scores={{ overall_bonus: overallBonus }}
        onScoreChange={(_field: keyof QuestionFields, value: number) =>
          onOverallBonusChange(value)
        }
        disabled={isQuestionDone || !participant.isActive}
        cols={1}
      />
    </div>
  );
};
