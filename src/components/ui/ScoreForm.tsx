import { useTranslation } from "react-i18next";
import { useCallback, useEffect } from "react";
import { ScoreCategory } from "./ScoreCategory";
import { QuestionTabs } from "./QuestionTabs";
import { getSectionWeight } from "../../utils/scoreUtils";
import { Jury, Participant, QuestionFields } from "../../models/models";

// Define a type for scores that don't include overall_bonus
type QuestionOnlyFields = Omit<QuestionFields, "overall_bonus">;

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
  onQuestionChange: (questionNumber: number) => void;
  onDone: () => void;
  isSaving: boolean;
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
  onQuestionChange,
  onDone,
  isSaving,
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

  // Determine if inputs should be disabled - only disable if jury has finished evaluation
  const isDisabled = juryMember?.hasFinishedEvaluating || !juryMember?.isActive;

  // Calculate Hifdh mistakes sum and apply warning class
  const hifdhWarningClass =
    currentScores.hifdh_judge_correction >= 3 ? "border-2 border-red-500" : "";

  return (
    <div className="space-y-2">
      <QuestionTabs
        participant={participant}
        juryMember={juryMember}
        selectedQuestion={selectedQuestion}
        onQuestionChange={onQuestionChange}
        onDone={onDone}
        isSaving={isSaving}
        disabled={isDisabled}
      />

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
          disabled={isDisabled}
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
          disabled={isDisabled}
          scores={currentScores}
          onScoreChange={handleScoreChange}
          cols={2}
        />

        {/* Waqf & Ibtida Section */}
        <ScoreCategory
          title={t("jury.categories.waqf")}
          subtitle={`${getSectionWeight("waqf")} `}
          disabled={isDisabled}
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
          disabled={isDisabled}
          cols={1}
        />
      </div>

      {/* Overall Bonus Section - Participant Level */}
      <ScoreCategory
        title={t("jury.categories.overall_bonus_title")}
        subtitle={`${getSectionWeight("overall_bonus")} - ${t("jury.categories.participant_level_bonus")}`}
        labels={[]}
        fields={[]}
        scores={{}}
        onScoreChange={() => {}}
        customInput={
          <div className="flex flex-col items-center space-y-4">
            <div className="w-full max-w-md">
              <div className="space-y-2">
                <label htmlFor="overall-bonus" className="text-sm font-medium">
                  {t("jury.categories.overall_bonus")}
                </label>
                <input
                  id="overall-bonus"
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={overallBonus}
                  onChange={(e) => onOverallBonusChange(Number(e.target.value))}
                  disabled={isDisabled}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span className="font-medium">{overallBonus}</span>
                  <span>5</span>
                </div>
              </div>
            </div>
            <div className="text-center">
              <span className="text-xs text-muted-foreground">
                {t("jury.categories.overall_bonus_description")}
              </span>
            </div>
          </div>
        }
      />
    </div>
  );
};
