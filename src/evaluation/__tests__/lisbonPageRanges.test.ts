import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { buildLisbonEvaluationConfig } from "../lisbonConfigSeed";

// Design section 2, "Lisbon config seed" table — the authoritative
// question-slot page ranges for all fourteen leaf categories.
const EXPECTED_RANGES: Record<string, [number, number][]> = {
  A1: [
    [3, 51],
    [52, 101],
  ],
  A2: [
    [502, 548],
    [549, 596],
  ],
  B1: [
    [3, 101],
    [102, 201],
  ],
  B2: [
    [402, 498],
    [499, 596],
  ],
  C1: [
    [3, 135],
    [136, 268],
    [269, 401],
  ],
  C2: [
    [202, 332],
    [333, 463],
    [464, 596],
  ],
  D1: [
    [3, 200],
    [201, 398],
    [399, 596],
  ],
  D2: [
    [3, 200],
    [201, 398],
    [399, 596],
  ],
  M1: [
    [582, 588],
    [589, 596],
  ],
  M2: [
    [542, 551],
    [552, 561],
  ],
  X: [
    [3, 27],
    [28, 53],
  ],
  Y: [
    [3, 101],
    [102, 200],
    [201, 301],
  ],
  W1: [
    [3, 21],
    [22, 40],
    [41, 61],
  ],
  W2: [
    [3, 200],
    [201, 398],
    [399, 596],
  ],
};

describe("Lisbon config seed: explicit page-slot ranges", () => {
  it("reproduces all fourteen legacy category partitions exactly", async () => {
    const config = await buildLisbonEvaluationConfig(Timestamp.now());
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

  it("X ends at page 53 and does not expand through Juz 3 (page 61)", async () => {
    const config = await buildLisbonEvaluationConfig(Timestamp.now());
    const lastSlot = config.categories.X.questionSlots[1];
    expect(lastSlot.pageRange.endPage).toBe(53);
  });

  it("D1 and D2 retain identical ranges", async () => {
    const config = await buildLisbonEvaluationConfig(Timestamp.now());
    const d1 = config.categories.D1.questionSlots.map((s) => [
      s.pageRange.startPage,
      s.pageRange.endPage,
    ]);
    const d2 = config.categories.D2.questionSlots.map((s) => [
      s.pageRange.startPage,
      s.pageRange.endPage,
    ]);
    expect(d1).toEqual(d2);
  });
});
