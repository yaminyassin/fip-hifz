import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Card } from "@/components/shadcn/card";
import { useTranslation } from "react-i18next";

export interface ScoreInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

/** A generic bounded integer/decimal counter (+/- buttons), driven entirely
 * by the caller's `min`/`max`/`step` — no hardcoded field or range. */
export const ScoreInput = ({
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
    <Card className={`w-36 p-2 ${disabled ? "opacity-60" : ""}`} data-testid={`score-input-${resolvedLabel}`}>
      <div className="flex flex-col gap-y-4 justify-center">
        <div className="flex text-center justify-center w-full">
          <Label className="flex items-center justify-center px-1 text-muted-foreground">
            {resolvedLabel}
          </Label>
        </div>
        <div className="flex justify-center flex-row gap-2">
          <Button
            size="default"
            onClick={handleDecrement}
            disabled={value <= min || disabled}
            aria-label={`${resolvedLabel} ${t("jury.actions.decrease")}`}
          >
            -
          </Button>

          <div className="flex text-center justify-center align-center border border-gray-700 rounded-sm">
            <Label className="flex items-center justify-center w-8 max-w-8">
              {value}
            </Label>
          </div>

          <Button
            size="default"
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
