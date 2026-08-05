import { useTranslation } from "react-i18next";
import { Button } from "@/components/shadcn/button";
import type { ConfigDraft } from "@/evaluation/configDraft";
import type { EditorAction } from "./editorReducer";
import { EditorCard, NumberField, SelectField, TextField } from "./fields";

interface SectionProps {
  draft: ConfigDraft;
  dispatch: (action: EditorAction) => void;
  disabled?: boolean;
}

/** Scoring: the arithmetic frame every question is scored inside. */
export function ScoringSection({ draft, dispatch, disabled }: SectionProps) {
  const { t } = useTranslation();
  const s = draft.scoring;

  return (
    <EditorCard
      title={t("configEditor.scoring.title")}
      description={t("configEditor.scoring.description")}
      testId="config-scoring"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          label={t("configEditor.scoring.baseScore")}
          hint={t("configEditor.scoring.baseScoreHint")}
          value={s.baseScorePerQuestion}
          disabled={disabled}
          testId="scoring-base-score"
          onCommit={(value) =>
            dispatch({ type: "setScoring", patch: { baseScorePerQuestion: value } })
          }
        />
        <NumberField
          label={t("configEditor.scoring.questionMin")}
          value={s.questionBounds.min}
          disabled={disabled}
          testId="scoring-question-min"
          onCommit={(value) =>
            dispatch({
              type: "setScoring",
              patch: { questionBounds: { ...s.questionBounds, min: value } },
            })
          }
        />
        <NumberField
          label={t("configEditor.scoring.questionMax")}
          hint={t("configEditor.scoring.questionMaxHint")}
          value={s.questionBounds.max}
          disabled={disabled}
          testId="scoring-question-max"
          onCommit={(value) =>
            dispatch({
              type: "setScoring",
              patch: { questionBounds: { ...s.questionBounds, max: value } },
            })
          }
        />
        <NumberField
          label={t("configEditor.scoring.finalMin")}
          value={s.finalBounds.min}
          disabled={disabled}
          testId="scoring-final-min"
          onCommit={(value) =>
            dispatch({
              type: "setScoring",
              patch: { finalBounds: { ...s.finalBounds, min: value } },
            })
          }
        />
        <NumberField
          label={t("configEditor.scoring.finalMax")}
          value={s.finalBounds.max}
          disabled={disabled}
          testId="scoring-final-max"
          onCommit={(value) =>
            dispatch({
              type: "setScoring",
              patch: { finalBounds: { ...s.finalBounds, max: value } },
            })
          }
        />
        <SelectField
          label={t("configEditor.scoring.missingPolicy")}
          hint={t("configEditor.scoring.missingPolicyHint")}
          value={s.missingQuestionPolicy}
          disabled={disabled}
          testId="scoring-missing-policy"
          options={[
            {
              value: "incompleteEvaluation",
              label: t("configEditor.scoring.policyIncomplete"),
            },
            {
              value: "zeroInputsArePerfect",
              label: t("configEditor.scoring.policyZeroPerfect"),
            },
          ]}
          onChange={(value) =>
            dispatch({
              type: "setScoring",
              patch: { missingQuestionPolicy: value },
            })
          }
        />
      </div>
    </EditorCard>
  );
}

/** Question types: the sections a juror fills in for every question. */
export function QuestionTypesSection({ draft, dispatch, disabled }: SectionProps) {
  const { t } = useTranslation();
  const questionTypes = Object.values(draft.questionTypes).sort(
    (a, b) => a.order - b.order
  );

  return (
    <EditorCard
      title={t("configEditor.questionTypes.title")}
      description={t("configEditor.questionTypes.description")}
      testId="config-question-types"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid="add-question-type"
          onClick={() => dispatch({ type: "addQuestionType" })}
        >
          {t("configEditor.questionTypes.add")}
        </Button>
      }
    >
      {questionTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("configEditor.questionTypes.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {questionTypes.map((qt) => {
            const cap =
              qt.operation === "subtract"
                ? qt.perSectionDeductionCap
                : qt.perSectionAdditionCap;
            return (
              <div
                key={qt.id}
                className="rounded-md border border-border/70 p-3"
                data-testid={`question-type-${qt.id}`}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField
                    label={t("configEditor.common.name")}
                    value={qt.label.default}
                    disabled={disabled}
                    testId={`qt-${qt.id}-label`}
                    onChange={(value) =>
                      dispatch({
                        type: "setQuestionTypeLabel",
                        questionTypeId: qt.id,
                        label: value,
                      })
                    }
                  />
                  <SelectField
                    label={t("configEditor.questionTypes.operation")}
                    hint={t("configEditor.questionTypes.operationHint")}
                    value={qt.operation}
                    disabled={disabled}
                    testId={`qt-${qt.id}-operation`}
                    options={[
                      {
                        value: "subtract",
                        label: t("configEditor.questionTypes.subtract"),
                      },
                      { value: "add", label: t("configEditor.questionTypes.add") },
                    ]}
                    onChange={(value) =>
                      dispatch({
                        type: "setQuestionTypeOperation",
                        questionTypeId: qt.id,
                        operation: value,
                      })
                    }
                  />
                  <NumberField
                    label={t("configEditor.questionTypes.cap")}
                    hint={t("configEditor.questionTypes.capHint")}
                    value={cap}
                    disabled={disabled}
                    testId={`qt-${qt.id}-cap`}
                    onCommit={(value) =>
                      dispatch({
                        type: "setQuestionTypeCap",
                        questionTypeId: qt.id,
                        cap: value,
                      })
                    }
                  />
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={disabled}
                      data-testid={`qt-${qt.id}-remove`}
                      onClick={() =>
                        dispatch({
                          type: "removeQuestionType",
                          questionTypeId: qt.id,
                        })
                      }
                    >
                      {t("configEditor.common.remove")}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 border-t border-border/60 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      {t("configEditor.inputs.title")}
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      data-testid={`qt-${qt.id}-add-input`}
                      onClick={() =>
                        dispatch({ type: "addInput", questionTypeId: qt.id })
                      }
                    >
                      {t("configEditor.inputs.add")}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {qt.inputs.map((input) => (
                      <div
                        key={input.id}
                        className="grid gap-3 rounded border border-border/50 p-2 sm:grid-cols-3 lg:grid-cols-6"
                        data-testid={`qt-${qt.id}-input-${input.id}`}
                      >
                        <TextField
                          label={t("configEditor.common.name")}
                          value={input.label.default}
                          disabled={disabled}
                          testId={`qt-${qt.id}-input-${input.id}-label`}
                          onChange={(value) =>
                            dispatch({
                              type: "setInput",
                              questionTypeId: qt.id,
                              inputId: input.id,
                              patch: { label: { default: value } },
                            })
                          }
                        />
                        <SelectField
                          label={t("configEditor.inputs.role")}
                          hint={t("configEditor.inputs.roleHint")}
                          value={input.role}
                          disabled={disabled}
                          testId={`qt-${qt.id}-input-${input.id}-role`}
                          options={[
                            {
                              value: "scored",
                              label: t("configEditor.inputs.scored"),
                            },
                            {
                              value: "informational",
                              label: t("configEditor.inputs.informational"),
                            },
                          ]}
                          onChange={(value) =>
                            dispatch({
                              type: "setInput",
                              questionTypeId: qt.id,
                              inputId: input.id,
                              patch: { role: value },
                            })
                          }
                        />
                        {/* An informational input carries no weight at all —
                            the validator rejects the key outright. */}
                        {input.role === "scored" ? (
                          <NumberField
                            label={t("configEditor.inputs.weight")}
                            hint={t("configEditor.inputs.weightHint")}
                            value={input.perInputWeight}
                            step={0.5}
                            disabled={disabled}
                            testId={`qt-${qt.id}-input-${input.id}-weight`}
                            onCommit={(value) =>
                              dispatch({
                                type: "setInput",
                                questionTypeId: qt.id,
                                inputId: input.id,
                                patch: { perInputWeight: value },
                              })
                            }
                          />
                        ) : (
                          <div className="flex items-end text-xs text-muted-foreground">
                            {t("configEditor.inputs.noWeight")}
                          </div>
                        )}
                        <NumberField
                          label={t("configEditor.inputs.min")}
                          value={input.min}
                          disabled={disabled}
                          testId={`qt-${qt.id}-input-${input.id}-min`}
                          onCommit={(value) =>
                            dispatch({
                              type: "setInput",
                              questionTypeId: qt.id,
                              inputId: input.id,
                              patch: { min: value },
                            })
                          }
                        />
                        <NumberField
                          label={t("configEditor.inputs.max")}
                          value={input.max}
                          disabled={disabled}
                          testId={`qt-${qt.id}-input-${input.id}-max`}
                          onCommit={(value) =>
                            dispatch({
                              type: "setInput",
                              questionTypeId: qt.id,
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
                            data-testid={`qt-${qt.id}-input-${input.id}-remove`}
                            onClick={() =>
                              dispatch({
                                type: "removeInput",
                                questionTypeId: qt.id,
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
              </div>
            );
          })}
        </div>
      )}
    </EditorCard>
  );
}

/** Categories: who competes, and which pages each question is drawn from. */
export function CategoriesSection({ draft, dispatch, disabled }: SectionProps) {
  const { t } = useTranslation();
  const categories = Object.values(draft.categories).sort(
    (a, b) => a.order - b.order
  );

  return (
    <EditorCard
      title={t("configEditor.categories.title")}
      description={t("configEditor.categories.description")}
      testId="config-categories"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid="add-category"
          onClick={() => dispatch({ type: "addCategory" })}
        >
          {t("configEditor.categories.add")}
        </Button>
      }
    >
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("configEditor.categories.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((category) => (
            <div
              key={category.id}
              className="rounded-md border border-border/70 p-3"
              data-testid={`category-${category.id}`}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextField
                  label={t("configEditor.common.name")}
                  value={category.label.default}
                  disabled={disabled}
                  testId={`cat-${category.id}-label`}
                  onChange={(value) =>
                    dispatch({
                      type: "setCategoryLabel",
                      categoryId: category.id,
                      label: value,
                    })
                  }
                />
                <NumberField
                  label={t("configEditor.categories.questionCount")}
                  hint={t("configEditor.categories.questionCountHint")}
                  value={category.questionCount}
                  min={1}
                  disabled={disabled}
                  testId={`cat-${category.id}-question-count`}
                  onCommit={(value) =>
                    dispatch({
                      type: "setCategoryQuestionCount",
                      categoryId: category.id,
                      count: value,
                    })
                  }
                />
                <TextField
                  label={t("configEditor.categories.assetRef")}
                  hint={t("configEditor.categories.assetRefHint")}
                  value={category.assetRef ?? ""}
                  disabled={disabled}
                  testId={`cat-${category.id}-asset`}
                  onChange={(value) =>
                    dispatch({
                      type: "setCategoryAssetRef",
                      categoryId: category.id,
                      assetRef: value,
                    })
                  }
                />
                <div className="flex items-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={disabled}
                    data-testid={`cat-${category.id}-remove`}
                    onClick={() =>
                      dispatch({
                        type: "removeCategory",
                        categoryId: category.id,
                      })
                    }
                  >
                    {t("configEditor.common.remove")}
                  </Button>
                </div>
              </div>

              <div className="mt-3 border-t border-border/60 pt-3">
                <h4 className="mb-2 text-sm font-medium">
                  {t("configEditor.categories.slots")}
                </h4>
                <div className="flex flex-col gap-2">
                  {category.questionSlots.map((slot, index) => (
                    <div
                      key={slot.questionNumber}
                      className="grid items-end gap-3 rounded border border-border/50 p-2 sm:grid-cols-3 lg:grid-cols-5"
                      data-testid={`cat-${category.id}-slot-${slot.questionNumber}`}
                    >
                      <div className="text-sm font-medium">
                        {t("configEditor.categories.question", {
                          number: slot.questionNumber,
                        })}
                      </div>
                      <NumberField
                        label={t("configEditor.categories.startPage")}
                        value={slot.pageRange.startPage}
                        min={1}
                        disabled={disabled}
                        testId={`cat-${category.id}-slot-${slot.questionNumber}-start`}
                        onCommit={(value) =>
                          dispatch({
                            type: "setSlotPageRange",
                            categoryId: category.id,
                            index,
                            patch: { startPage: value },
                          })
                        }
                      />
                      <NumberField
                        label={t("configEditor.categories.endPage")}
                        value={slot.pageRange.endPage}
                        min={1}
                        disabled={disabled}
                        testId={`cat-${category.id}-slot-${slot.questionNumber}-end`}
                        onCommit={(value) =>
                          dispatch({
                            type: "setSlotPageRange",
                            categoryId: category.id,
                            index,
                            patch: { endPage: value },
                          })
                        }
                      />
                      <NumberField
                        label={t("configEditor.categories.juzStart")}
                        hint={t("configEditor.categories.juzHint")}
                        value={slot.sourceJuzRange?.start ?? 0}
                        min={0}
                        disabled={disabled}
                        testId={`cat-${category.id}-slot-${slot.questionNumber}-juz-start`}
                        onCommit={(value) =>
                          dispatch({
                            type: "setSlotJuzRange",
                            categoryId: category.id,
                            index,
                            range:
                              value <= 0
                                ? null
                                : {
                                    start: value,
                                    end: slot.sourceJuzRange?.end ?? value,
                                  },
                          })
                        }
                      />
                      <NumberField
                        label={t("configEditor.categories.juzEnd")}
                        value={slot.sourceJuzRange?.end ?? 0}
                        min={0}
                        disabled={disabled || !slot.sourceJuzRange}
                        testId={`cat-${category.id}-slot-${slot.questionNumber}-juz-end`}
                        onCommit={(value) =>
                          dispatch({
                            type: "setSlotJuzRange",
                            categoryId: category.id,
                            index,
                            range: slot.sourceJuzRange
                              ? { ...slot.sourceJuzRange, end: value }
                              : null,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </EditorCard>
  );
}
