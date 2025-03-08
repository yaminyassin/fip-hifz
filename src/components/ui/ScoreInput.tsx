import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Card } from "@/components/shadcn/card";
import { QuestionFields } from "@/models/models";
import { useTranslation } from "react-i18next";

export interface ScoreInputProps {
  label: string;
  field: keyof QuestionFields;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const ScoreInput = ({
  label,
  value,
  onChange,
  disabled = false,
}: ScoreInputProps) => {
  const { t } = useTranslation();

  const handleIncrement = () => {
    if (value < 10) {
      onChange(value + 1);
    }
  };

  const handleDecrement = () => {
    if (value > 0) {
      onChange(value - 1);
    }
  };

  return (
    <Card className={`w-36 p-2 ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex flex-col gap-y-4 justify-center">
        <div className="flex text-center justify-center w-full">
          <Label className="flex items-center justify-center px-1 text-muted-foreground">
            {t(label)}
          </Label>
        </div>
        <div className="flex justify-center flex-row gap-2">
          <Button
            size="sm"
            onClick={handleDecrement}
            disabled={value <= 0 || disabled}
            aria-label={t("jury.actions.decrease")}
          >
            -
          </Button>

          <div className="flex text-center justify-center align-center border border-gray-700 rounded-sm">
            <Label className="flex items-center justify-center w-8 max-w-8">
              {value}
            </Label>
          </div>

          <Button
            size="sm"
            onClick={handleIncrement}
            disabled={value >= 10 || disabled}
            aria-label={t("jury.actions.increase")}
          >
            +
          </Button>
        </div>
      </div>
    </Card>
  );
};
