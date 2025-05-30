import { Card } from "@/components/shadcn/card";
import { Slider } from "@/components/shadcn/slider";
import { QuestionFields } from "@/models/models";
import { useTranslation } from "react-i18next";

export interface SliderInputProps {
  label: string;
  field: keyof QuestionFields;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

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

  // Create markers for the slider stops
  const markers = Array.from({ length: max - min + 1 }, (_, i) => i + min);

  return (
    <Card className={`w-full p-4 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-y-4">
        <div className="space-y-4">
          <div className="relative px-2">
            <Slider
              value={[value]}
              onValueChange={handleValueChange}
              max={max}
              min={min}
              step={step}
              disabled={disabled}
              className="w-full"
              aria-label={t(label)}
            />

            {/* Slider markers */}
            <div className="flex justify-between mt-2 px-1">
              {markers.map((mark) => (
                <div key={mark} className="flex flex-col items-center">
                  <div className="w-1 h-2 bg-muted-foreground/30 rounded-full" />
                  <span className="text-xs text-muted-foreground mt-1 font-medium">
                    {mark}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
