import { Card } from "../shadcn/card";
import { ScoreInput } from "./ScoreInput";
import { SliderInput } from "./SliderInput";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EvaluationInputDefinition } from "@/evaluation/types";

interface ScoreCategoryProps {
  title: string;
  subtitle?: string;
  /** Ordered input definitions for this section, straight from the event's
   * config — never a hardcoded field list. */
  inputs: readonly EvaluationInputDefinition[];
  values: Record<string, number>;
  onValueChange: (inputId: string, value: number) => void;
  disabled?: boolean;
  className?: string;
  customInput?: ReactNode;
}

function inputCaption(input: EvaluationInputDefinition, infoLabel: string): string {
  if (input.role === "scored") {
    return `×${input.perInputWeight} pts`;
  }
  return infoLabel;
}

export const ScoreCategory = ({
  title,
  subtitle,
  inputs,
  values,
  onValueChange,
  disabled = false,
  className = "",
  customInput,
}: ScoreCategoryProps) => {
  const { t } = useTranslation();

  // Determine grid class based on input count (bounded 1..4 columns).
  const cols = Math.min(Math.max(inputs.length, 1), 4);
  const gridColsClass = `grid-cols-${cols}`;

  if (customInput) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex flex-row mb-2 justify-between align-baseline">
          <h3 className="text-lg font-semibold">{title}</h3>
          {subtitle && (
            <span className="text-sm text-muted-foreground">{subtitle}</span>
          )}
        </div>
        {customInput}
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex flex-row mb-2 justify-between align-baseline">
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle && (
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>
      <div className={`grid ${gridColsClass} gap-4`}>
        {inputs.map((input) => (
          <div key={input.id} className="flex flex-col items-center">
            {input.control === "slider" ? (
              <SliderInput
                label={input.label.default}
                value={values[input.id] ?? input.min}
                onChange={(value) => onValueChange(input.id, value)}
                disabled={disabled}
                min={input.min}
                max={input.max}
                step={input.step}
              />
            ) : (
              <ScoreInput
                label={input.label.default}
                value={values[input.id] ?? input.min}
                onChange={(value) => onValueChange(input.id, value)}
                disabled={disabled}
                min={input.min}
                max={input.max}
                step={input.step}
              />
            )}
            <span className="text-xs text-center mt-1 font-medium text-muted-foreground w-full">
              {inputCaption(input, t("jury.categories.informational", "Info"))}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
