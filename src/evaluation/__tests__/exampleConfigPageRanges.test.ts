import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { buildExampleEvaluationConfig } from "../exampleConfigSeed";

// docs/migrations/phase-1-greenfield.md section 5, "Trial event to build
// against" — the authoritative question-slot page ranges for the three
// example categories.
const EXPECTED_RANGES: Record<string, [number, number][]> = {
  CAT_A: [
    [3, 51],
    [52, 101],
  ],
  CAT_B: [
    [3, 135],
    [136, 268],
    [269, 401],
  ],
  CAT_M: [
    [582, 588],
    [589, 596],
  ],
};

describe("Example config seed: explicit page-slot ranges", () => {
  it("reproduces all three example category partitions exactly", async () => {
    const config = await buildExampleEvaluationConfig(Timestamp.now());
    expect(Object.keys(config.categories).sort()).toEqual(Object.keys(EXPECTED_RANGES).sort());

    for (const [categoryId, ranges] of Object.entries(EXPECTED_RANGES)) {
      const category = config.categories[categoryId];
      expect(category, `category ${categoryId} missing`).toBeDefined();
      expect(category.questionCount).toBe(ranges.length);
      const actual = category.questionSlots
        .slice()
        .sort((a, b) => a.questionNumber - b.questionNumber)
        .map((slot) => [slot.pageRange.startPage, slot.pageRange.endPage]);
      expect(actual).toEqual(ranges);
    }
  });

  it("ranges are non-overlapping and ascending within each category", async () => {
    const config = await buildExampleEvaluationConfig(Timestamp.now());
    for (const category of Object.values(config.categories)) {
      const ordered = category.questionSlots
        .slice()
        .sort((a, b) => a.questionNumber - b.questionNumber);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i].pageRange.startPage).toBeGreaterThan(
          ordered[i - 1].pageRange.endPage
        );
      }
    }
  });
});
