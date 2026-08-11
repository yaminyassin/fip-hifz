import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EvaluationInputDefinition,
  QuestionTypeDefinition,
} from "@/evaluation/types";
import { ScoreCategory } from "./ScoreCategory";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const input = {
  id: "correction",
  label: { default: "Correction" },
  order: 1,
  control: "integerCounter",
  min: 0,
  max: 10,
  step: 1,
  role: "scored",
  perInputWeight: 4,
} satisfies EvaluationInputDefinition;

describe("ScoreCategory", () => {
  it("stretches its input grid and controls to the available group height", () => {
    render(
      <ScoreCategory
        title="Corrections"
        inputs={[input]}
        operation="subtract"
        values={{ correction: 0 }}
        onValueChange={() => {}}
      />
    );

    const inputGrid = screen.getByTestId("score-category-input-grid");

    expect(inputGrid.parentElement?.className).toContain("h-full");
    expect(inputGrid.className).toContain("flex-1");
    expect(inputGrid.className).toContain("auto-rows-fr");
    expect(inputGrid.className).toContain("repeat(auto-fit");
    expect(inputGrid.firstElementChild?.className).toContain("flex");
  });

  it.each([
    ["subtract", "-4 pts"],
    ["add", "+4 pts"],
  ] satisfies ReadonlyArray<[QuestionTypeDefinition["operation"], string]>) (
    "shows %s input weights as %s",
    (operation, caption) => {
      render(
        <ScoreCategory
          title="Corrections"
          inputs={[input]}
          operation={operation}
          values={{ correction: 0 }}
          onValueChange={() => {}}
        />
      );

      expect(screen.getByText(caption)).toBeTruthy();
      expect(screen.queryByText("×4 pts")).toBeNull();
    }
  );
});
