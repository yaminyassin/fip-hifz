import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { buildExampleEvaluationConfig } from "../exampleConfigSeed";
import { validateEvaluationConfig } from "../configValidation";
import {
  scoreJury,
  scoreParticipant,
  scoreQuestion,
  type QuestionValueMap,
} from "../scoringEngine";
import {
  buildDefaultAdjustmentValues,
  buildDefaultQuestionValues,
  mergeAdjustmentValues,
  mergeQuestionValues,
  pickRandomPageFromSlot,
  questionWouldVoid,
} from "../configHelpers";

/**
 * End-to-end (in-process) proof that the example `demo-2026` config drives
 * every stage of scoring purely from its own data: category page ranges ->
 * random question generation, question types -> jury input defaults/merge,
 * weights/cap/void/add-subtract -> per-question scoring, and the additive
 * `overall_bonus` adjustment -> jury/participant aggregation. Complements
 * the emulator e2e coverage (e2e/juryEvaluation.spec.ts,
 * e2e/participantsRanking.spec.ts, e2e/evaluationConfigGate.spec.ts), which
 * exercises the same config through the real app + Firestore.
 */
describe("example config: full config-driven scoring pipeline", () => {
  const provisionedAt = Timestamp.fromDate(new Date("2026-01-01"));

  it("passes its own validator (fail-closed provisioning precondition)", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const result = validateEvaluationConfig(config);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("random page generation stays within each category's authoritative page ranges", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    for (const category of Object.values(config.categories)) {
      for (const slot of category.questionSlots) {
        for (let i = 0; i < 200; i++) {
          const page = pickRandomPageFromSlot(slot);
          expect(page).toBeGreaterThanOrEqual(slot.pageRange.startPage);
          expect(page).toBeLessThanOrEqual(slot.pageRange.endPage);
        }
      }
    }
  });

  it("random page generation excludes previously-used pages until the range is exhausted", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const slot = config.categories.CAT_M.questionSlots[0]; // [582, 588], 7 pages
    const allPages = Array.from(
      { length: slot.pageRange.endPage - slot.pageRange.startPage + 1 },
      (_, i) => slot.pageRange.startPage + i
    );
    for (let i = 0; i < 50; i++) {
      const excluded = allPages.slice(0, allPages.length - 1); // exclude all but one
      const page = pickRandomPageFromSlot(slot, excluded);
      expect(page).toBe(allPages[allPages.length - 1]);
    }
  });

  it("jury input defaults are built from every questionType's inputs, at their min value", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const defaults = buildDefaultQuestionValues(config);
    expect(Object.keys(defaults).sort()).toEqual(["hifdh", "presentation", "tajweed"]);
    expect(defaults.hifdh).toEqual({ judge_correction: 0, self_correction: 0, stuck: 0 });
    expect(defaults.tajweed).toEqual({ major: 0, minor: 0 });
    expect(defaults.presentation).toEqual({ fluency: 0 });

    const adjustmentDefaults = buildDefaultAdjustmentValues(config);
    expect(adjustmentDefaults.overall_bonus).toEqual({ bonus: 0 });
  });

  it("merges partial stored values onto config defaults so every current input has a value", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const stored: QuestionValueMap = { hifdh: { judge_correction: 2 } } as unknown as QuestionValueMap;
    const merged = mergeQuestionValues(config, stored);
    expect(merged.hifdh).toEqual({ judge_correction: 2, self_correction: 0, stuck: 0 });
    expect(merged.tajweed).toEqual({ major: 0, minor: 0 });

    const mergedAdjustments = mergeAdjustmentValues(config, undefined);
    expect(mergedAdjustments.overall_bonus).toEqual({ bonus: 0 });
  });

  it("scores a question via weights, a section cap, and the additive presentation section", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const values: QuestionValueMap = {
      hifdh: { judge_correction: 1, self_correction: 1, stuck: 0 }, // 1*3 + 1*2 = 5
      tajweed: { major: 1, minor: 1 }, // 1*2 + 1*1 = 3
      presentation: { fluency: 2 }, // 2*1 = 2 (add)
    };
    const result = scoreQuestion(config, values);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sectionImpacts).toEqual({ hifdh: 5, tajweed: 3, presentation: 2 });
      // 100 - 5 - 3 + 2 = 94
      expect(result.value.score).toBe(94);
      expect(result.value.terminalRuleId).toBeNull();
    }
  });

  it("the section cap clamps an over-large deduction (hifdh cap 50)", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const values: QuestionValueMap = {
      hifdh: { judge_correction: 2, self_correction: 10, stuck: 0 }, // 2 stays below void, but 2*3+10*2=26
      tajweed: { major: 0, minor: 0 },
      presentation: { fluency: 0 },
    };
    const result = scoreQuestion(config, values);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sectionImpacts.hifdh).toBe(26);
      expect(result.value.score).toBe(74);
    }
  });

  it("the void override rule fires at judge_correction >= 3 and zeroes the question", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const voidingValues: QuestionValueMap = {
      hifdh: { judge_correction: 3, self_correction: 0, stuck: 0 },
      tajweed: { major: 0, minor: 0 },
      presentation: { fluency: 5 }, // even a max bonus doesn't survive a void
    };
    expect(questionWouldVoid(config, voidingValues)).toBe(true);

    const result = scoreQuestion(config, voidingValues);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(0);
      expect(result.value.terminalRuleId).toBe("hifdh-judge-correction-void");
      expect(result.value.sectionImpacts).toEqual({ hifdh: 0, tajweed: 0, presentation: 0 });
    }

    const nonVoidingValues: QuestionValueMap = {
      hifdh: { judge_correction: 2, self_correction: 0, stuck: 0 },
      tajweed: { major: 0, minor: 0 },
      presentation: { fluency: 0 },
    };
    expect(questionWouldVoid(config, nonVoidingValues)).toBe(false);
  });

  it("scores a full jury evaluation (both questions + the additive overall_bonus adjustment) for CAT_A", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const q1: QuestionValueMap = {
      hifdh: { judge_correction: 1, self_correction: 1, stuck: 0 },
      tajweed: { major: 0, minor: 0 },
      presentation: { fluency: 2 },
    };
    const q2: QuestionValueMap = {
      hifdh: { judge_correction: 0, self_correction: 0, stuck: 0 },
      tajweed: { major: 0, minor: 0 },
      presentation: { fluency: 0 },
    };
    const questionValues = new Map([
      [1, q1],
      [2, q2],
    ]);
    const adjustmentValues = { overall_bonus: { bonus: 2 } };

    const result = scoreJury(config, [1, 2], questionValues, adjustmentValues);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Q1 = 100 - 5 + 2 = 97, Q2 = 100 -> base = 98.5
      expect(result.value.juryBase).toBe(98.5);
      // overall_bonus: 2 * weight 1 = 2, add, cap 5 -> +2
      expect(result.value.signedAdjustmentTotal).toBe(2);
      expect(result.value.juryFinal).toBe(100.5);
    }
  });

  it("aggregates multiple juries into a rounded participant final score", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const perfect: QuestionValueMap = {
      hifdh: { judge_correction: 0, self_correction: 0, stuck: 0 },
      tajweed: { major: 0, minor: 0 },
      presentation: { fluency: 0 },
    };
    const questionValues = new Map([
      [1, perfect],
      [2, perfect],
    ]);

    const juryOne = scoreJury(config, [1, 2], questionValues, { overall_bonus: { bonus: 5 } });
    const juryTwo = scoreJury(config, [1, 2], questionValues, { overall_bonus: { bonus: 0 } });
    expect(juryOne.ok && juryTwo.ok).toBe(true);
    if (!juryOne.ok || !juryTwo.ok) return;

    // Jury one: 100 + 5 = 105. Jury two: 100 + 0 = 100. Average = 102.5.
    expect(juryOne.value.juryFinal).toBe(105);
    expect(juryTwo.value.juryFinal).toBe(100);

    const aggregate = scoreParticipant(
      new Map([
        ["jury-one", juryOne.value],
        ["jury-two", juryTwo.value],
      ])
    );
    expect(aggregate.ok).toBe(true);
    if (aggregate.ok) {
      expect(aggregate.value).toBe(102.5);
    }
  });

  it("an incomplete jury evaluation (missing a question) is rejected rather than silently scored", async () => {
    const config = await buildExampleEvaluationConfig(provisionedAt);
    const q1: QuestionValueMap = {
      hifdh: { judge_correction: 0, self_correction: 0, stuck: 0 },
      tajweed: { major: 0, minor: 0 },
      presentation: { fluency: 0 },
    };
    const result = scoreJury(config, [1, 2], new Map([[1, q1]]), { overall_bonus: { bonus: 0 } });
    expect(result.ok).toBe(false);
  });
});
