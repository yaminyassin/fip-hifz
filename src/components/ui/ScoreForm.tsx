import { useTranslation } from "react-i18next";
import { useCallback, useEffect } from "react";
import { ScoreCategory } from "./ScoreCategory";
import { QuestionTabs } from "./QuestionTabs";
import { SliderInput } from "./SliderInput";
import { Jury, Participant } from "../../models/models";
import { useEvent } from "@/contexts/EventContext";
import { orderedEntries, questionWouldVoid } from "@/evaluation/configHelpers";
import type { AdjustmentValueMap, QuestionValueMap } from "@/evaluation/scoringEngine";

interface ScoreFormProps {
  participant: Participant | null;
  juryMember: Jury | null;
  selectedQuestion: number;
  questionChangedExternally: boolean;
  isViewingActiveQuestion: boolean;
  activeQuestionNumber: number | null;
  currentScores: QuestionValueMap;
  adjustmentValues: AdjustmentValueMap;
  allScores: Record<number, QuestionValueMap>;
  pendingSave: boolean;
  onScoreChange: (
    questionTypeId: string,
    inputId: string,
    value: number,
    selectedQuestion: number
  ) => void;
  onAdjustmentChange: (adjustmentId: string, inputId: string, value: number) => void;
  onQuestionChange: (questionNumber: number) => void;
  onDone: () => void;
  onGoToActiveQuestion: () => void;
  isSaving: boolean;
  setCurrentScores: (scores: QuestionValueMap) => void;
  defaultQuestionValues: QuestionValueMap;
}

/**
 * Renders one section per `config.questionTypes` (ordered by `order`), one
 * input per section input with its `min`/`max`/`step`/`control`/`label`/
 * weight, plus one section per `config.participantAdjustments` (e.g. the
 * overall bonus slider). No hardcoded hifdh/tajweed/bonus blocks — this
 * component only renders under the `ready` config gate, so `evaluationConfig`
 * is always present here.
 */
export const ScoreForm = ({
  participant,
  juryMember,
  selectedQuestion,
  questionChangedExternally,
  isViewingActiveQuestion,
  activeQuestionNumber,
  currentScores,
  adjustmentValues,
  allScores,
  pendingSave,
  onScoreChange,
  onAdjustmentChange,
  onQuestionChange,
  onDone,
  onGoToActiveQuestion,
  isSaving,
  setCurrentScores,
  defaultQuestionValues,
}: ScoreFormProps) => {
  const { t } = useTranslation();
  const { evaluationConfig } = useEvent();

  // Load current scores for the selected question, but don't override
  // optimistic updates while a save is pending.
  useEffect(() => {
    if (pendingSave) return;

    if (selectedQuestion && allScores[selectedQuestion]) {
      setCurrentScores({
        ...defaultQuestionValues,
        ...allScores[selectedQuestion],
      });
    } else {
      setCurrentScores(defaultQuestionValues);
    }
  }, [selectedQuestion, allScores, setCurrentScores, defaultQuestionValues, pendingSave]);

  const handleScoreChange = useCallback(
    (questionTypeId: string, inputId: string, value: number) =>
      onScoreChange(questionTypeId, inputId, value, selectedQuestion),
    [onScoreChange, selectedQuestion]
  );

  if (!evaluationConfig) return null;

  // Determine if inputs should be disabled - only disable if jury has finished evaluation
  const isDisabled = juryMember?.hasFinishedEvaluating || !juryMember?.isActive;

  // A generic "would this void the question" check, derived entirely from
  // the config's own override rules — never a hardcoded threshold.
  const willVoid = questionWouldVoid(evaluationConfig, currentScores);
  const voidWarningClass = willVoid ? "border-2 border-red-500" : "";

  const orderedQuestionTypes = orderedEntries(evaluationConfig.questionTypes);
  const orderedAdjustments = orderedEntries(evaluationConfig.participantAdjustments);

  return (
    <div className="space-y-2">
      <QuestionTabs
        participant={participant}
        juryMember={juryMember}
        selectedQuestion={selectedQuestion}
        questionChangedExternally={questionChangedExternally}
        isViewingActiveQuestion={isViewingActiveQuestion}
        activeQuestionNumber={activeQuestionNumber}
        onQuestionChange={onQuestionChange}
        onDone={onDone}
        onGoToActiveQuestion={onGoToActiveQuestion}
        isSaving={isSaving}
        disabled={isDisabled}
      />

      {willVoid && (
        <div className="rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300">
          {t("jury.messages.questionWillBeVoided", "This question will be voided based on the current inputs.")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {orderedQuestionTypes.map(([sectionId, section]) => {
          const orderedInputs = section.inputs.slice().sort((a, b) => a.order - b.order);
          const cap = section.operation === "subtract" ? section.perSectionDeductionCap : section.perSectionAdditionCap;
          const capLabel =
            section.operation === "subtract"
              ? t("jury.categories.maxDeduction", "Max {{cap}} pts deduction", { cap })
              : t("jury.categories.maxAddition", "Max +{{cap}} pts", { cap });

          return (
            <ScoreCategory
              key={sectionId}
              title={section.label.default}
              subtitle={capLabel}
              inputs={orderedInputs}
              disabled={isDisabled}
              values={currentScores[sectionId] ?? {}}
              onValueChange={(inputId, value) => handleScoreChange(sectionId, inputId, value)}
              className={sectionId === orderedQuestionTypes[0]?.[0] ? voidWarningClass : ""}
            />
          );
        })}
      </div>

      {/* Participant-level adjustments (e.g. overall bonus) */}
      {orderedAdjustments.map(([adjustmentId, adjustment]) => {
        const cap = adjustment.operation === "subtract" ? adjustment.deductionCap : adjustment.additionCap;
        const capLabel =
          adjustment.operation === "subtract"
            ? t("jury.categories.maxDeduction", "Max {{cap}} pts deduction", { cap })
            : t("jury.categories.maxAddition", "Max +{{cap}} pts", { cap });
        const orderedInputs = adjustment.inputs.slice().sort((a, b) => a.order - b.order);

        return (
          <ScoreCategory
            key={adjustmentId}
            title={adjustment.label.default}
            subtitle={`${capLabel} - ${t("jury.categories.participant_level_bonus")}`}
            inputs={[]}
            values={{}}
            onValueChange={() => {}}
            customInput={
              <div className="flex flex-col items-center space-y-4">
                {orderedInputs.map((input) => (
                  <div key={input.id} className="w-full max-w-md">
                    <SliderInput
                      label={input.label.default}
                      value={adjustmentValues[adjustmentId]?.[input.id] ?? input.min}
                      onChange={(value) => onAdjustmentChange(adjustmentId, input.id, value)}
                      disabled={isDisabled}
                      min={input.min}
                      max={input.max}
                      step={input.step}
                    />
                  </div>
                ))}
                <div className="text-center">
                  <span className="text-xs text-muted-foreground">
                    {t("jury.categories.overall_bonus_description")}
                  </span>
                </div>
              </div>
            }
          />
        );
      })}
    </div>
  );
};
