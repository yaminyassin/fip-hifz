import { Card } from "../shadcn/card";
import { ScoreInput } from "./ScoreInput";
import { getErrorPenalty } from "../../utils/scoreUtils";
import { QuestionFields } from "../../models/models";

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
}: ScoreCategoryProps) => {
  // Determine grid class based on cols prop
  const gridColsClass = `grid-cols-${cols}`;

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex flex-col mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle && (
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>
      <div className={`grid ${gridColsClass} gap-4`}>
        {fields.map((field, index) => (
          <div key={field} className="flex flex-col items-center">
            <ScoreInput
              label={labels[index]}
              field={field}
              value={scores[field] ?? 0}
              onChange={(value) => onScoreChange(field, value)}
              disabled={disabled}
            />
            <span className="text-xs text-center mt-1 font-medium text-muted-foreground w-full">
              {getErrorPenalty(field)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
