import { Card } from "@/components/shadcn/card";
import { Slider } from "@/components/shadcn/slider";
import { useTranslation } from "react-i18next";

export interface SliderInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

/** A compact bounded slider driven by the caller's `min`, `max`, and `step`. */
export const SliderInput = ({
  label,
  value,
  onChange,
  disabled = false,
  min = 0,
  max = 5,
  step = 1,
}: SliderInputProps) => {
  const { t } = useTranslation();

  const handleValueChange = (newValue: number[]) => {
    onChange(newValue[0]);
  };

  const resolvedLabel = t(label);

  return (
    <Card
      className={`w-full min-w-0 p-3 ${disabled ? "opacity-60" : ""}`}
      data-testid={`slider-input-${resolvedLabel}`}
    >
      <div className="flex h-full min-h-9 min-w-0 flex-col justify-center gap-3">
        <div className="flex items-center justify-between gap-2">
          <label className="min-w-0 text-xs font-medium leading-tight text-muted-foreground">
            {resolvedLabel}
          </label>
          <span className="text-sm font-bold text-primary">{value}</span>
        </div>
        <Slider
          value={[value]}
          onValueChange={handleValueChange}
          max={max}
          min={min}
          step={step}
          disabled={disabled}
          className="w-full py-1"
          aria-label={resolvedLabel}
        />
      </div>
    </Card>
  );
};
