import { useTranslation } from "react-i18next";
import { useCallback, useEffect } from "react";
import { ScoreCategory } from "./ScoreCategory";
import { QuestionTabs } from "./QuestionTabs";
import { Button } from "@/components/shadcn/button";
import { Jury, Participant } from "../../models/models";
import { useEvent } from "@/contexts/EventContext";
import { orderedEntries, questionWouldVoid } from "@/evaluation/configHelpers";
import type { AdjustmentValueMap, QuestionValueMap } from "@/evaluation/scoringEngine";
import type { JuryScoreSaveError } from "@/hooks/useJuryScores";
import type { JuryFinishError } from "@/hooks/useJuryNavigation";

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
  /** Last write that did not reach Firestore, or null. */
  saveError: JuryScoreSaveError | null;
  /** Set when the stored scores could not be read — inputs stay locked. */
  loadError: string | null;
  /** Why Finish was refused, or null. */
  finishError: JuryFinishError | null;
  onRetryLoad: () => void;
  onDismissSaveError: () => void;
  onDismissFinishError: () => void;
}

function questionGroupSpanClass(inputCount: number): string {
  if (inputCount >= 3) return "md:col-span-2 xl:col-span-3";
  if (inputCount === 2) return "xl:col-span-2";
  return "xl:col-span-1";
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
  saveError,
  loadError,
  finishError,
  onRetryLoad,
  onDismissSaveError,
  onDismissFinishError,
}: ScoreFormProps) => {
  const { t } = useTranslation();
  const { evaluationConfig } = useEvent();

  // Load current scores for the selected question, but don't override
  // optimistic updates while a save is pending.
  //
  // `loadError` short-circuits this deliberately: when the stored scores
  // failed to read, `allScores` is empty and the `else` branch below would
  // reset every input to the config defaults (zeros) — which the first edit
  // would then persist over the scores that ARE stored. Leaving the inputs
  // untouched and disabled is the only safe state until the read succeeds.
  useEffect(() => {
    if (pendingSave || loadError) return;

    if (selectedQuestion && allScores[selectedQuestion]) {
      setCurrentScores({
        ...defaultQuestionValues,
        ...allScores[selectedQuestion],
      });
    } else {
      setCurrentScores(defaultQuestionValues);
    }
  }, [selectedQuestion, allScores, setCurrentScores, defaultQuestionValues, pendingSave, loadError]);

  const handleScoreChange = useCallback(
    (questionTypeId: string, inputId: string, value: number) =>
      onScoreChange(questionTypeId, inputId, value, selectedQuestion),
    [onScoreChange, selectedQuestion]
  );

  if (!evaluationConfig) return null;

  // Inputs are disabled once the jury has finished, when the jury is
  // deactivated, and — critically — while the stored scores are unreadable,
  // so no edit can be written on top of scores this form never loaded.
  const isDisabled =
    juryMember?.hasFinishedEvaluating || !juryMember?.isActive || loadError !== null;

  // A generic "would this void the question" check, derived entirely from
  // the config's own override rules — never a hardcoded threshold.
  const willVoid = questionWouldVoid(evaluationConfig, currentScores);
  const voidWarningClass = willVoid ? "border-2 border-red-500" : "";

  const orderedQuestionTypes = orderedEntries(evaluationConfig.questionTypes);
  const orderedAdjustments = orderedEntries(evaluationConfig.participantAdjustments);

  return (
    <div className="space-y-2">
      {loadError && (
        <div
          role="alert"
          data-testid="score-load-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
        >
          <div>
            <p className="font-semibold">{t("jury.messages.loadFailedTitle")}</p>
            <p>{t("jury.messages.loadFailedDesc")}</p>
            <p className="mt-1 text-xs opacity-80">{loadError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onRetryLoad}>
            {t("jury.actions.retryLoad")}
          </Button>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          data-testid="score-save-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
        >
          <div>
            <p className="font-semibold">{t("jury.messages.saveFailedTitle")}</p>
            <p>
              {saveError.questionNumber === null
                ? t("jury.messages.adjustmentSaveFailedDesc", { reason: saveError.message })
                : t("jury.messages.saveFailedDesc", {
                    number: saveError.questionNumber,
                    reason: saveError.message,
                  })}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onDismissSaveError}>
            {t("common.dismiss")}
          </Button>
        </div>
      )}

      {finishError && (
        <div
          role="alert"
          data-testid="jury-finish-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
        >
          <div>
            <p className="font-semibold">{t("jury.messages.finishBlockedTitle")}</p>
            <p>
              {finishError.kind === "incomplete"
                ? t("jury.messages.finishBlockedDesc", {
                    questions: finishError.missingQuestions.join(", "),
                    count: finishError.missingQuestions.length,
                  })
                : t("jury.messages.finishFailedDesc", { reason: finishError.message })}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onDismissFinishError}>
            {t("common.dismiss")}
          </Button>
        </div>
      )}

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

      <div
        data-testid="score-form-group-grid"
        className="grid grid-cols-1 items-stretch gap-3 [grid-auto-flow:dense] md:grid-cols-2 xl:grid-cols-6"
      >
        {orderedQuestionTypes.map(([sectionId, section]) => {
          const orderedInputs = section.inputs.slice().sort((a, b) => a.order - b.order);
          const cap = section.operation === "subtract" ? section.perSectionDeductionCap : section.perSectionAdditionCap;
          const capLabel =
            section.operation === "subtract"
              ? t("jury.categories.maxDeduction", { cap })
              : t("jury.categories.maxAddition", { cap });

          return (
            <ScoreCategory
              key={sectionId}
              title={section.label.default}
              subtitle={capLabel}
              inputs={orderedInputs}
              operation={section.operation}
              disabled={isDisabled}
              values={currentScores[sectionId] ?? {}}
              onValueChange={(inputId, value) => handleScoreChange(sectionId, inputId, value)}
              className={`${questionGroupSpanClass(orderedInputs.length)} ${
                sectionId === orderedQuestionTypes[0]?.[0]
                  ? voidWarningClass
                  : ""
              }`}
            />
          );
        })}

        {orderedAdjustments.length > 0 && (
          <div className="col-span-full flex flex-wrap items-stretch gap-3">
            {orderedAdjustments.map(([adjustmentId, adjustment]) => {
              const cap =
                adjustment.operation === "subtract"
                  ? adjustment.deductionCap
                  : adjustment.additionCap;
              const capLabel =
                adjustment.operation === "subtract"
                  ? t("jury.categories.maxDeduction", { cap })
                  : t("jury.categories.maxAddition", { cap });
              const orderedInputs = adjustment.inputs
                .slice()
                .sort((a, b) => a.order - b.order);

              return (
                <div
                  key={adjustmentId}
                  className="min-w-full flex-1 sm:min-w-64"
                  style={{ flexGrow: Math.max(orderedInputs.length, 1) }}
                >
                  <ScoreCategory
                    title={adjustment.label.default}
                    subtitle={`${capLabel} - ${t("jury.categories.participant_level_bonus")}`}
                    inputs={orderedInputs}
                    operation={adjustment.operation}
                    values={adjustmentValues[adjustmentId] ?? {}}
                    onValueChange={(inputId, value) =>
                      onAdjustmentChange(adjustmentId, inputId, value)
                    }
                    disabled={isDisabled}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
