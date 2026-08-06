import { describe, expect, it } from "vitest";
import { buildTrialWeightedConfig } from "@/evaluation/__tests__/fixtures";
import {
  isParticipantCategoryValid,
  participantCategoryOptions,
} from "./participantFormCategories";

describe("participant form categories", () => {
  it("uses canonical category record IDs and labels from the event config", () => {
    const config = buildTrialWeightedConfig();
    config.categories = {
      CAT_B: { ...config.categories.S, id: "CAT_B", order: 2, label: { default: "Category B" } },
      CAT_A: { ...config.categories.S, id: "CAT_A", order: 1, label: { default: "Category A" } },
    };

    expect(participantCategoryOptions(config)).toEqual([
      { id: "CAT_A", label: "Category A", order: 1 },
      { id: "CAT_B", label: "Category B", order: 2 },
    ]);
    expect(isParticipantCategoryValid(config, "CAT_A")).toBe(true);
    expect(isParticipantCategoryValid(config, "A1")).toBe(false);
  });

  it("fails closed when config is unavailable or record key and category ID disagree", () => {
    expect(participantCategoryOptions(null)).toEqual([]);
    expect(isParticipantCategoryValid(null, "CAT_A")).toBe(false);

    const config = buildTrialWeightedConfig();
    config.categories = {
      CAT_A: { ...config.categories.S, id: "OTHER" },
    };
    expect(isParticipantCategoryValid(config, "CAT_A")).toBe(false);
  });
});
