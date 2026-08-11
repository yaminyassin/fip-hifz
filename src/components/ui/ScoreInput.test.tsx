import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvaluationInputDefinition } from "@/evaluation/types";
import { EvaluationInputControl } from "./EvaluationInputControl";
import { ScoreInput } from "./ScoreInput";
import { SliderInput } from "./SliderInput";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/shadcn/slider", () => ({
  Slider: () => <div />,
}));

afterEach(cleanup);

describe("ScoreInput", () => {
  it("renders an increment-only control without a decrement action", () => {
    const onChange = vi.fn();

    const { container } = render(
      <ScoreInput
        control="incrementButton"
        label="Mistakes"
        value={8}
        min={0}
        max={10}
        step={2}
        onChange={onChange}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Mistakes jury.actions.decrease" })
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="score-input-Mistakes"]')
        ?.firstElementChild?.className
    ).toContain("items-center");
    expect(
      container.querySelector('[data-testid="score-input-Mistakes"]')
        ?.firstElementChild?.className
    ).toContain("h-full");

    fireEvent.click(
      screen.getByRole("button", { name: "Mistakes jury.actions.increase" })
    );

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("maps an incrementButton config to the increment-only control", () => {
    const onChange = vi.fn();
    const input = {
      id: "mistakes",
      label: { default: "Mistakes" },
      order: 1,
      control: "incrementButton",
      min: 0,
      max: 5,
      step: 1,
      role: "scored",
      perInputWeight: 1,
    } satisfies EvaluationInputDefinition;

    render(
      <EvaluationInputControl input={input} value={0} onChange={onChange} />
    );

    expect(
      screen.queryByRole("button", { name: "Mistakes jury.actions.decrease" })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Mistakes jury.actions.increase" })
    );
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("centers slider content within the available input height", () => {
    const { container } = render(
      <SliderInput label="Bonus" value={2} onChange={() => {}} />
    );

    expect(
      container.querySelector('[data-testid="slider-input-Bonus"]')
        ?.firstElementChild?.className
    ).toContain("h-full");
  });
});
