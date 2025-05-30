import { Card } from "../shadcn/card";
import { ScoreInput } from "./ScoreInput";
import { SliderInput } from "./SliderInput";
import { getErrorPenalty } from "../../utils/scoreUtils";
import { QuestionFields } from "../../models/models";
import { ReactNode } from "react";

interface ScoreCategoryProps {
  title: string;
  subtitle?: string;
  labels: string[];
  fields: (keyof QuestionFields)[];
  scores: Partial<QuestionFields>;
  onScoreChange: (field: keyof QuestionFields, value: number) => void;
  disabled?: boolean;
  cols?: number;
  className?: string;
  inputType?: "default" | "slider";
  customInput?: ReactNode;
}

export const ScoreCategory = ({
  title,
  subtitle,
  labels,
  fields,
  scores,
  onScoreChange,
  disabled = false,
  cols = 3,
  className = "",
  inputType = "default",
  customInput,
}: ScoreCategoryProps) => {
  // Determine grid class based on cols prop
  const gridColsClass = `grid-cols-${cols}`;

  // If custom input is provided, use it
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
        {fields.map((field, index) => (
          <div key={field} className="flex flex-col items-center">
            {inputType === "slider" ? (
              <SliderInput
                label={labels[index]}
                field={field}
                value={scores[field] ?? 0}
                onChange={(value) => onScoreChange(field, value)}
                disabled={disabled}
                max={5}
                min={0}
                step={1}
              />
            ) : (
              <ScoreInput
                label={labels[index]}
                field={field}
                value={scores[field] ?? 0}
                onChange={(value) => onScoreChange(field, value)}
                disabled={disabled}
              />
            )}
            <span className="text-xs text-center mt-1 font-medium text-muted-foreground w-full">
              {getErrorPenalty(field)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
