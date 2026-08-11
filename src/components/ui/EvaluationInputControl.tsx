import type { EvaluationInputDefinition } from "@/evaluation/types";
import { ScoreInput } from "./ScoreInput";
import { SliderInput } from "./SliderInput";

interface EvaluationInputControlProps {
  input: EvaluationInputDefinition;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** Renders the control selected by an event's evaluation config. */
export function EvaluationInputControl({
  input,
  value,
  onChange,
  disabled = false,
}: EvaluationInputControlProps) {
  switch (input.control) {
    case "slider":
      return (
        <SliderInput
          label={input.label.default}
          value={value}
          onChange={onChange}
          disabled={disabled}
          min={input.min}
          max={input.max}
          step={input.step}
        />
      );

    case "integerCounter":
    case "decimalCounter":
    case "incrementButton":
      return (
        <ScoreInput
          control={input.control}
          label={input.label.default}
          value={value}
          onChange={onChange}
          disabled={disabled}
          min={input.min}
          max={input.max}
          step={input.step}
        />
      );

    default: {
      const unhandledControl: never = input.control;
      return unhandledControl;
    }
  }
}
