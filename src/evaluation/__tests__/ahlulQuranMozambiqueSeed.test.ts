import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  AHLUL_QURAN_MOZAMBIQUE_CATEGORY_IDS,
  buildAhlulQuranMozambiqueConfig,
  splitIntoSlots,
} from "../ahlulQuranMozambiqueSeed";
import { validateEvaluationConfig } from "../configValidation";
import { computeConfigContentHash, computeScoringFingerprint } from "../configHash";
import { scoreQuestion } from "../scoringEngine";
import { juzToPageMap } from "../../lib/quranUtils";

const AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

describe("Ahlul Qur'an Mozambique seed: categories", () => {
  it("defines exactly the seven categories on the organizer's sheet", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    expect(Object.keys(config.categories).sort()).toEqual(
      ["A1", "A2", "B1", "B2", "C1", "C2", "D"].sort()
    );
    expect(AHLUL_QURAN_MOZAMBIQUE_CATEGORY_IDS).toEqual([
      "A1",
      "A2",
      "B1",
      "B2",
      "C1",
      "C2",
      "D",
    ]);
  });

  it("gives each category the question count the sheet specifies", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    const expected: Record<string, number> = {
      A1: 2,
      A2: 2,
      B1: 2,
      B2: 2,
      C1: 3,
      C2: 3,
      D: 3,
    };
    for (const [id, questionCount] of Object.entries(expected)) {
      expect(config.categories[id].questionCount, id).toBe(questionCount);
      expect(config.categories[id].questionSlots.length, id).toBe(questionCount);
    }
  });

  it("covers exactly the Juz span each category claims, with no gap or overlap", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    // Category id -> the Juz span written on the sheet.
    const expectedSpans: Record<string, [number, number]> = {
      A1: [30, 30],
      A2: [1, 1],
      B1: [1, 5],
      B2: [26, 30],
      C1: [1, 15],
      C2: [16, 30],
      D: [1, 30],
    };

    for (const [id, [juzStart, juzEnd]] of Object.entries(expectedSpans)) {
      const slots = config.categories[id].questionSlots
        .slice()
        .sort((a, b) => a.questionNumber - b.questionNumber);

      // The slots tile the whole span: first starts where the first Juz
      // starts, last ends where the last Juz ends, and each slot resumes on
      // the page after the previous one.
      expect(slots[0].pageRange.startPage, id).toBe(juzToPageMap[juzStart].start);
      expect(slots[slots.length - 1].pageRange.endPage, id).toBe(
        juzToPageMap[juzEnd].end
      );
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i].pageRange.startPage, `${id} slot ${i + 1}`).toBe(
          slots[i - 1].pageRange.endPage + 1
        );
      }

      // sourceJuzRange is display metadata, so what matters is that the big
      // screen's min/max across slots reproduces the declared span.
      const derivedStart = Math.min(...slots.map((s) => s.sourceJuzRange!.start));
      const derivedEnd = Math.max(...slots.map((s) => s.sourceJuzRange!.end));
      expect([derivedStart, derivedEnd], id).toEqual([juzStart, juzEnd]);
    }
  });

  it("numbers slots 1..questionCount", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    for (const [id, category] of Object.entries(config.categories)) {
      expect(category.questionSlots.map((s) => s.questionNumber), id).toEqual(
        Array.from({ length: category.questionCount }, (_, i) => i + 1)
      );
    }
  });

  it("claims no category artwork — the bundled art is for the Lisbon scheme", async () => {
    // src/assets/categories/A2.png reads "5 AJZA (26-30)", which is Lisbon's
    // A2, not this event's. Rendering it would put a wrong Juz range on the
    // big screen, so no category may carry an assetRef until art exists for
    // this scheme.
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    for (const [id, category] of Object.entries(config.categories)) {
      expect(category.assetRef, id).toBeUndefined();
    }
  });
});

describe("Ahlul Qur'an Mozambique seed: the page-splitting rule", () => {
  // The rule is only trustworthy if it reproduces the partitions already
  // published in docs/migrations/phase-1-evaluation-model.md, which were
  // authored by hand. These five are every published category whose span is a
  // whole number of Juz.
  it.each([
    ["A1 (Juz 1-5)", 3, 101, 2, [[3, 51], [52, 101]]],
    ["A2 (Juz 26-30)", 502, 596, 2, [[502, 548], [549, 596]]],
    ["C1 (Juz 1-20)", 3, 401, 3, [[3, 135], [136, 268], [269, 401]]],
    ["D1 (Juz 1-30)", 3, 596, 3, [[3, 200], [201, 398], [399, 596]]],
    ["M1 (Juz 30)", 582, 596, 2, [[582, 588], [589, 596]]],
  ])("reproduces the published partition for %s", (_label, start, end, count, expected) => {
    const slots = splitIntoSlots(start as number, end as number, count as number);
    expect(slots.map((s) => [s.pageRange.startPage, s.pageRange.endPage])).toEqual(
      expected
    );
  });

  it("never drops or duplicates a page", () => {
    for (const count of [2, 3]) {
      const slots = splitIntoSlots(3, 596, count);
      const pages = slots.flatMap((s) =>
        Array.from(
          { length: s.pageRange.endPage - s.pageRange.startPage + 1 },
          (_, i) => s.pageRange.startPage + i
        )
      );
      expect(pages.length).toBe(594);
      expect(new Set(pages).size).toBe(594);
    }
  });
});

describe("Ahlul Qur'an Mozambique seed: scoring rubric", () => {
  it("scores Tajweed on minor mistakes only — no major input survives", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    const tajweed = config.questionTypes.tajweed;
    expect(tajweed.inputs.map((input) => input.id)).toEqual(["minor"]);
    expect(tajweed.inputCount).toBe(1);

    // Nothing anywhere else in the config may reintroduce a major mistake,
    // including as a zero-weight leftover or an override-rule reference.
    const allInputIds = [
      ...Object.values(config.questionTypes).flatMap((qt) =>
        qt.inputs.map((input) => `${qt.id}.${input.id}`)
      ),
      ...Object.values(config.participantAdjustments).flatMap((adjustment) =>
        adjustment.inputs.map((input) => `${adjustment.id}.${input.id}`)
      ),
    ];
    expect(allInputIds.filter((id) => id.includes("major"))).toEqual([]);
    for (const rule of config.overrideRules) {
      for (const condition of rule.when.conditions) {
        expect(condition.input.inputId).not.toBe("major");
      }
    }
  });

  it("carries the rest of the Lisbon rubric with its documented weights", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    const weightOf = (sectionId: string, inputId: string) => {
      const input = config.questionTypes[sectionId].inputs.find((i) => i.id === inputId);
      return input && input.role === "scored" ? input.perInputWeight : undefined;
    };

    expect(weightOf("hifdh", "judge_correction")).toBe(3);
    expect(weightOf("hifdh", "self_correction")).toBe(2);
    expect(weightOf("tajweed", "minor")).toBe(1);
    expect(weightOf("waqf", "waqf_ibtida_incorrect")).toBe(0.3);
    expect(weightOf("waqf", "waqf_ibtida_meaning")).toBe(0.7);
    expect(weightOf("husn_al_ada", "mistakes")).toBe(1);

    // "Times stuck" is recorded but must never move the score.
    const stuck = config.questionTypes.hifdh.inputs.find((i) => i.id === "stuck");
    expect(stuck?.role).toBe("informational");

    const caps: Record<string, number> = {
      hifdh: 50,
      tajweed: 30,
      waqf: 10,
      husn_al_ada: 10,
    };
    for (const [id, cap] of Object.entries(caps)) {
      const section = config.questionTypes[id];
      expect(section.operation, id).toBe("subtract");
      expect(
        section.operation === "subtract" ? section.perSectionDeductionCap : null,
        id
      ).toBe(cap);
    }
  });

  it("deducts one mark per minor Tajweed mistake and nothing for a major one", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    const perfect = {
      hifdh: { judge_correction: 0, self_correction: 0, stuck: 0 },
      tajweed: { minor: 0 },
      waqf: { waqf_ibtida_incorrect: 0, waqf_ibtida_meaning: 0 },
      husn_al_ada: { mistakes: 0 },
    };

    const clean = scoreQuestion(config, perfect);
    expect(clean.ok && clean.value.score).toBe(100);

    const withMinors = scoreQuestion(config, {
      ...perfect,
      tajweed: { minor: 4 },
    });
    expect(withMinors.ok && withMinors.value.score).toBe(96);

    // A juror can no longer record a major mistake at all: the engine rejects
    // the input rather than silently ignoring it.
    const withMajor = scoreQuestion(config, {
      ...perfect,
      tajweed: { minor: 0, major: 2 },
    });
    expect(withMajor.ok).toBe(false);
  });

  it("voids a question at three judge corrections", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    const result = scoreQuestion(config, {
      hifdh: { judge_correction: 3, self_correction: 0, stuck: 0 },
      tajweed: { minor: 0 },
      waqf: { waqf_ibtida_incorrect: 0, waqf_ibtida_meaning: 0 },
      husn_al_ada: { mistakes: 0 },
    });
    expect(result.ok && result.value.score).toBe(0);
    expect(result.ok && result.value.terminalRuleId).toBe(
      "hifdh-judge-correction-void"
    );
  });

  it("caps a section's deduction at its own cap", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    // 10 minor mistakes = 10 marks, well under the 30 cap; 10 husn mistakes
    // = 10 marks, exactly at the 10 cap.
    const result = scoreQuestion(config, {
      hifdh: { judge_correction: 0, self_correction: 0, stuck: 0 },
      tajweed: { minor: 10 },
      waqf: { waqf_ibtida_incorrect: 0, waqf_ibtida_meaning: 0 },
      husn_al_ada: { mistakes: 10 },
    });
    expect(result.ok && result.value.score).toBe(80);
  });
});

describe("Ahlul Qur'an Mozambique seed: config integrity", () => {
  it("passes the fail-closed validator", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    const validation = validateEvaluationConfig(config);
    expect(validation.ok ? [] : validation.errors).toEqual([]);
  });

  it("stamps hashes a reader reconstructs from the same canonical fields", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);

    expect(
      await computeScoringFingerprint({
        scoring: config.scoring,
        categories: config.categories,
        questionTypes: config.questionTypes,
        overrideRules: config.overrideRules,
        participantAdjustments: config.participantAdjustments,
      })
    ).toBe(config.scoringFingerprint);

    const { contentHash, provisionedAt, ...withoutHash } = config;
    void provisionedAt;
    expect(await computeConfigContentHash(withoutHash)).toBe(contentHash);
  });

  it("is stable across builds — provisionedAt is excluded from both hashes", async () => {
    const first = await buildAhlulQuranMozambiqueConfig(AT);
    const second = await buildAhlulQuranMozambiqueConfig(
      Timestamp.fromDate(new Date("2027-06-06T12:34:56.000Z"))
    );
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.scoringFingerprint).toBe(first.scoringFingerprint);
  });

  it("leaves headroom for the overall bonus but not above it", async () => {
    const config = await buildAhlulQuranMozambiqueConfig(AT);
    expect(config.scoring.baseScorePerQuestion).toBe(100);
    expect(config.scoring.questionBounds).toEqual({ min: 0, max: 100 });
    expect(config.scoring.finalBounds).toEqual({ min: 0, max: 105 });
  });
});
