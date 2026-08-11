import { Card } from "../shadcn/card";
import { EvaluationInputControl } from "./EvaluationInputControl";
import { useTranslation } from "react-i18next";
import type {
  EvaluationInputDefinition,
  QuestionTypeDefinition,
} from "@/evaluation/types";

type EvaluationOperation = QuestionTypeDefinition["operation"];

interface ScoreCategoryProps {
  title: string;
  subtitle?: string;
  /** Ordered input definitions for this section, straight from the event's
   * config — never a hardcoded field list. */
  inputs: readonly EvaluationInputDefinition[];
  operation: EvaluationOperation;
  values: Record<string, number>;
  onValueChange: (inputId: string, value: number) => void;
  disabled?: boolean;
  className?: string;
}

function inputCaption(
  input: EvaluationInputDefinition,
  operation: EvaluationOperation,
  infoLabel: string
): string {
  if (input.role === "scored") {
    const sign = operation === "subtract" ? "-" : "+";
    return `${sign}${input.perInputWeight} pts`;
  }
  return infoLabel;
}

export const ScoreCategory = ({
  title,
  subtitle,
  inputs,
  operation,
  values,
  onValueChange,
  disabled = false,
  className = "",
}: ScoreCategoryProps) => {
  const { t } = useTranslation();

  return (
    <Card
      data-testid="score-category"
      className={`flex h-full flex-col p-3 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold leading-tight">{title}</h3>
        {subtitle && (
          <span className="text-right text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
      <div
        data-testid="score-category-input-grid"
        className="grid flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3"
      >
        {inputs.map((input) => (
          <div key={input.id} className="flex min-w-0 flex-col">
            <div className="flex flex-1">
              <EvaluationInputControl
                input={input}
                value={values[input.id] ?? input.min}
                onChange={(value) => onValueChange(input.id, value)}
                disabled={disabled}
              />
            </div>
            <span className="mt-1 block w-full text-left text-[11px] font-medium leading-none text-muted-foreground">
              {inputCaption(
                input,
                operation,
                t("jury.categories.informational", "Info")
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
