import { useTranslation } from "react-i18next";
import { Button } from "@/components/shadcn/button";
import type { ConfigDraft } from "@/evaluation/configDraft";
import type { QuestionOverrideAction } from "@/evaluation/types";
import type { EditorAction } from "./editorReducer";
import { EditorCard, NumberField, SelectField, TextField } from "./fields";

interface SectionProps {
  draft: ConfigDraft;
  dispatch: (action: EditorAction) => void;
  disabled?: boolean;
}

/**
 * Override rules: "if the juror enters this, the normal arithmetic does not
 * apply". Deliberately exposes all three engine actions — voidQuestion,
 * setQuestionScore, and setSectionImpact — so the editor covers what the
 * engine can actually do rather than a subset of it.
 */
export function OverrideRulesSection({ draft, dispatch, disabled }: SectionProps) {
  const { t } = useTranslation();

  const inputChoices = Object.values(draft.questionTypes)
    .sort((a, b) => a.order - b.order)
    .flatMap((qt) =>
      qt.inputs.map((input) => ({
        value: `${qt.id}::${input.id}`,
        label: `${qt.label.default} → ${input.label.default}`,
      }))
    );

  const questionTypeChoices = Object.values(draft.questionTypes)
    .sort((a, b) => a.order - b.order)
    .map((qt) => ({ value: qt.id, label: qt.label.default }));

  const rules = [...draft.overrideRules].sort((a, b) => a.priority - b.priority);

  return (
    <EditorCard
      title={t("configEditor.rules.title")}
      description={t("configEditor.rules.description")}
      testId="config-override-rules"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || inputChoices.length === 0}
          data-testid="add-rule"
          onClick={() => dispatch({ type: "addRule" })}
        >
          {t("configEditor.rules.add")}
        </Button>
      }
    >
      {inputChoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("configEditor.rules.needsInputs")}
        </p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("configEditor.rules.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => {
            const condition = rule.when.conditions[0];
            const selected = condition
              ? `${condition.input.questionTypeId}::${condition.input.inputId}`
              : "";
            return (
              <div
                key={rule.id}
                className="grid gap-3 rounded-md border border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-6"
                data-testid={`rule-${rule.id}`}
              >
                <NumberField
                  label={t("configEditor.rules.priority")}
                  hint={t("configEditor.rules.priorityHint")}
                  value={rule.priority}
                  disabled={disabled}
                  testId={`rule-${rule.id}-priority`}
                  onCommit={(value) =>
                    dispatch({
                      type: "setRule",
                      ruleId: rule.id,
                      patch: { priority: value },
                    })
                  }
                />
                <SelectField
                  label={t("configEditor.rules.when")}
                  value={selected}
                  disabled={disabled}
                  testId={`rule-${rule.id}-input`}
                  options={inputChoices}
                  onChange={(value) => {
                    const [questionTypeId, inputId] = value.split("::");
                    dispatch({
                      type: "setRule",
                      ruleId: rule.id,
                      patch: {
                        when: {
                          kind: "all",
                          conditions: [
                            {
                              input: { questionTypeId, inputId },
                              operator: condition?.operator ?? "gte",
                              value: condition?.value ?? 1,
                            },
                          ],
                        },
                      },
                    });
                  }}
                />
                <SelectField
                  label={t("configEditor.rules.operator")}
                  value={condition?.operator ?? "gte"}
                  disabled={disabled}
                  testId={`rule-${rule.id}-operator`}
                  options={[
                    { value: "gte", label: "≥" },
                    { value: "gt", label: ">" },
                    { value: "eq", label: "=" },
                    { value: "lte", label: "≤" },
                    { value: "lt", label: "<" },
                  ]}
                  onChange={(value) =>
                    condition &&
                    dispatch({
                      type: "setRule",
                      ruleId: rule.id,
                      patch: {
                        when: {
                          kind: "all",
                          conditions: [{ ...condition, operator: value }],
                        },
                      },
                    })
                  }
                />
                <NumberField
                  label={t("configEditor.rules.threshold")}
                  value={condition?.value ?? 0}
                  disabled={disabled}
                  testId={`rule-${rule.id}-value`}
                  onCommit={(value) =>
                    condition &&
                    dispatch({
                      type: "setRule",
                      ruleId: rule.id,
                      patch: {
                        when: {
                          kind: "all",
                          conditions: [{ ...condition, value }],
                        },
                      },
                    })
                  }
                />
                <SelectField
                  label={t("configEditor.rules.action")}
                  value={rule.action.kind}
                  disabled={disabled}
                  testId={`rule-${rule.id}-action`}
                  options={[
                    {
                      value: "voidQuestion",
                      label: t("configEditor.rules.void"),
                    },
                    {
                      value: "setQuestionScore",
                      label: t("configEditor.rules.fixedScore"),
                    },
                    {
                      value: "setSectionImpact",
                      label: t("configEditor.rules.sectionImpact"),
                    },
                  ]}
                  onChange={(kind) => {
                    const next: QuestionOverrideAction =
                      kind === "voidQuestion"
                        ? { kind: "voidQuestion" }
                        : kind === "setQuestionScore"
                          ? { kind: "setQuestionScore", score: 0 }
                          : {
                              kind: "setSectionImpact",
                              questionTypeId:
                                questionTypeChoices[0]?.value ?? "",
                              impact: 0,
                            };
                    dispatch({
                      type: "setRule",
                      ruleId: rule.id,
                      patch: { action: next },
                    });
                  }}
                />
                <div className="flex flex-col gap-2">
                  {rule.action.kind === "setQuestionScore" ? (
                    <NumberField
                      label={t("configEditor.rules.score")}
                      value={rule.action.score}
                      disabled={disabled}
                      testId={`rule-${rule.id}-score`}
                      onCommit={(score) =>
                        dispatch({
                          type: "setRule",
                          ruleId: rule.id,
                          patch: { action: { kind: "setQuestionScore", score } },
                        })
                      }
                    />
                  ) : null}
                  {rule.action.kind === "setSectionImpact" ? (
                    <>
                      <SelectField
                        label={t("configEditor.rules.section")}
                        value={rule.action.questionTypeId}
                        disabled={disabled}
                        testId={`rule-${rule.id}-section`}
                        options={questionTypeChoices}
                        onChange={(questionTypeId) =>
                          rule.action.kind === "setSectionImpact" &&
                          dispatch({
                            type: "setRule",
                            ruleId: rule.id,
                            patch: {
                              action: { ...rule.action, questionTypeId },
                            },
                          })
                        }
                      />
                      <NumberField
                        label={t("configEditor.rules.impact")}
                        value={rule.action.impact}
                        disabled={disabled}
                        testId={`rule-${rule.id}-impact`}
                        onCommit={(impact) =>
                          rule.action.kind === "setSectionImpact" &&
                          dispatch({
                            type: "setRule",
                            ruleId: rule.id,
                            patch: { action: { ...rule.action, impact } },
                          })
                        }
                      />
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={disabled}
                    data-testid={`rule-${rule.id}-remove`}
                    onClick={() =>
                      dispatch({ type: "removeRule", ruleId: rule.id })
                    }
                  >
                    {t("configEditor.common.remove")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </EditorCard>
  );
}

/** Participant adjustments: applied once per (participant, jury), not per question. */
export function AdjustmentsSection({ draft, dispatch, disabled }: SectionProps) {
  const { t } = useTranslation();
  const adjustments = Object.values(draft.participantAdjustments).sort(
    (a, b) => a.order - b.order
  );

  return (
    <EditorCard
      title={t("configEditor.adjustments.title")}
      description={t("configEditor.adjustments.description")}
      testId="config-adjustments"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid="add-adjustment"
          onClick={() => dispatch({ type: "addAdjustment" })}
        >
          {t("configEditor.adjustments.add")}
        </Button>
      }
    >
      {adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("configEditor.adjustments.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {adjustments.map((adj) => {
            const cap =
              adj.operation === "add" ? adj.additionCap : adj.deductionCap;
            return (
              <div
                key={adj.id}
                className="rounded-md border border-border/70 p-3"
                data-testid={`adjustment-${adj.id}`}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField
                    label={t("configEditor.common.name")}
                    value={adj.label.default}
                    disabled={disabled}
                    testId={`adj-${adj.id}-label`}
                    onChange={(value) =>
                      dispatch({
                        type: "setAdjustmentLabel",
                        adjustmentId: adj.id,
                        label: value,
                      })
                    }
                  />
                  <SelectField
                    label={t("configEditor.questionTypes.operation")}
                    value={adj.operation}
                    disabled={disabled}
                    testId={`adj-${adj.id}-operation`}
                    options={[
                      { value: "add", label: t("configEditor.questionTypes.add") },
                      {
                        value: "subtract",
                        label: t("configEditor.questionTypes.subtract"),
                      },
                    ]}
                    onChange={(value) =>
                      dispatch({
                        type: "setAdjustmentOperation",
                        adjustmentId: adj.id,
                        operation: value,
                      })
                    }
                  />
                  <NumberField
                    label={t("configEditor.adjustments.cap")}
                    value={cap}
                    disabled={disabled}
                    testId={`adj-${adj.id}-cap`}
                    onCommit={(value) =>
                      dispatch({
                        type: "setAdjustmentCap",
                        adjustmentId: adj.id,
                        cap: value,
                      })
                    }
                  />
                  <div className="flex items-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      data-testid={`adj-${adj.id}-add-input`}
                      onClick={() =>
                        dispatch({
                          type: "addAdjustmentInput",
                          adjustmentId: adj.id,
                        })
                      }
                    >
                      {t("configEditor.inputs.add")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={disabled}
                      data-testid={`adj-${adj.id}-remove`}
                      onClick={() =>
                        dispatch({
                          type: "removeAdjustment",
                          adjustmentId: adj.id,
                        })
                      }
                    >
                      {t("configEditor.common.remove")}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3">
                  {adj.inputs.map((input) => (
                    <div
                      key={input.id}
                      className="grid gap-3 rounded border border-border/50 p-2 sm:grid-cols-3 lg:grid-cols-6"
                    >
                      <TextField
                        label={t("configEditor.common.name")}
                        value={input.label.default}
                        disabled={disabled}
                        testId={`adj-${adj.id}-input-${input.id}-label`}
                        onChange={(value) =>
                          dispatch({
                            type: "setAdjustmentInput",
                            adjustmentId: adj.id,
                            inputId: input.id,
                            patch: { label: { default: value } },
                          })
                        }
                      />
                      <SelectField
                        label={t("configEditor.inputs.control")}
                        value={input.control}
                        disabled={disabled}
                        testId={`adj-${adj.id}-input-${input.id}-control`}
                        options={[
                          { value: "integerCounter", label: t("configEditor.inputs.counter") },
                          { value: "slider", label: t("configEditor.inputs.slider") },
                          { value: "decimalCounter", label: t("configEditor.inputs.decimal") },
                        ]}
                        onChange={(value) =>
                          dispatch({
                            type: "setAdjustmentInput",
                            adjustmentId: adj.id,
                            inputId: input.id,
                            patch: { control: value },
                          })
                        }
                      />
                      {input.role === "scored" ? (
                        <NumberField
                          label={t("configEditor.inputs.weight")}
                          value={input.perInputWeight}
                          step={0.5}
                          disabled={disabled}
                          testId={`adj-${adj.id}-input-${input.id}-weight`}
                          onCommit={(value) =>
                            dispatch({
                              type: "setAdjustmentInput",
                              adjustmentId: adj.id,
                              inputId: input.id,
                              patch: { perInputWeight: value },
                            })
                          }
                        />
                      ) : null}
                      <NumberField
                        label={t("configEditor.inputs.min")}
                        value={input.min}
                        disabled={disabled}
                        testId={`adj-${adj.id}-input-${input.id}-min`}
                        onCommit={(value) =>
                          dispatch({
                            type: "setAdjustmentInput",
                            adjustmentId: adj.id,
                            inputId: input.id,
                            patch: { min: value },
                          })
                        }
                      />
                      <NumberField
                        label={t("configEditor.inputs.max")}
                        value={input.max}
                        disabled={disabled}
                        testId={`adj-${adj.id}-input-${input.id}-max`}
                        onCommit={(value) =>
                          dispatch({
                            type: "setAdjustmentInput",
                            adjustmentId: adj.id,
                            inputId: input.id,
                            patch: { max: value },
                          })
                        }
                      />
                      <div className="flex items-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={disabled}
                          data-testid={`adj-${adj.id}-input-${input.id}-remove`}
                          onClick={() =>
                            dispatch({
                              type: "removeAdjustmentInput",
                              adjustmentId: adj.id,
                              inputId: input.id,
                            })
                          }
                        >
                          {t("configEditor.common.remove")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </EditorCard>
  );
}
