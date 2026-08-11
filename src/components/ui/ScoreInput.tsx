import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Card } from "@/components/shadcn/card";
import { useTranslation } from "react-i18next";
import type { InputControl } from "@/evaluation/types";

type CounterControl = Extract<
  InputControl,
  "integerCounter" | "decimalCounter" | "incrementButton"
>;

export interface ScoreInputProps {
  control: CounterControl;
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

/** A bounded counter driven by the caller's `min`, `max`, and `step`.
 * `incrementButton` omits the decrement action. */
export const ScoreInput = ({
  control,
  label,
  value,
  onChange,
  disabled = false,
  min = 0,
  max = 10,
  step = 1,
}: ScoreInputProps) => {
  const { t } = useTranslation();

  const handleIncrement = () => {
    if (value < max) {
      onChange(Math.min(max, value + step));
    }
  };

  const handleDecrement = () => {
    if (value > min) {
      onChange(Math.max(min, value - step));
    }
  };

  const resolvedLabel = t(label);

  return (
    <Card
      className={`w-full min-w-0 p-3 ${disabled ? "opacity-60" : ""}`}
      data-testid={`score-input-${resolvedLabel}`}
    >
      <div className="flex h-full min-h-9 min-w-0 items-center justify-between gap-3">
        <Label className="min-w-0 flex-1 text-xs leading-tight text-muted-foreground">
          {resolvedLabel}
        </Label>
        <div className="flex shrink-0 items-center gap-1">
          {control !== "incrementButton" ? (
            <Button
              size="icon"
              className="h-9 w-9"
              onClick={handleDecrement}
              disabled={value <= min || disabled}
              aria-label={`${resolvedLabel} ${t("jury.actions.decrease")}`}
            >
              -
            </Button>
          ) : null}

          <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-gray-700 bg-background text-center">
            <Label className="flex items-center justify-center">
              {value}
            </Label>
          </div>

          <Button
            size="icon"
            className="h-9 w-9"
            onClick={handleIncrement}
            disabled={value >= max || disabled}
            aria-label={`${resolvedLabel} ${t("jury.actions.increase")}`}
          >
            +
          </Button>
        </div>
      </div>
    </Card>
  );
};
