import { describe, expect, it } from "vitest";
import {
  clamp,
  round2,
  scoreJury,
  scoreParticipant,
  scoreQuestion,
  validateQuestionValues,
  type QuestionValueMap,
} from "../scoringEngine";
import {
  buildOverrideMatrixConfig,
  buildTrialShapesConfig,
  buildTrialWeightedConfig,
} from "./fixtures";

describe("clamp / round2", () => {
  it("clamps to bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("round2 reproduces ECMAScript Math.round tie direction", () => {
    expect(round2(96.25)).toBe(96.25);
    // 2.005 * 100 is not exactly 200.5 in binary64 (it's just above), so
    // this rounds up under ordinary IEEE-754 multiplication — captured here
    // as a pin against silently swapping in a "true" decimal rounder.
    expect(round2(2.005)).toBe(2.01);
    expect(round2(-0.005)).toBe(-0); // Math.round(-0.5) === -0 in ECMAScript
  });
});

describe("Trial 2: trial-weighted-2026 (decimal weights, clamp, void, additive section)", () => {
  const config = buildTrialWeightedConfig();

  it("Jury 1: Q1=94, Q2=94, base=94, bonus=3, final=97", () => {
    const q1: QuestionValueMap = { accuracy: { x: 2, y: 2 }, delivery: { z: 2 } };
    const q2: QuestionValueMap = { accuracy: { x: 0, y: 4 }, delivery: { z: 0 } };

    const r1 = scoreQuestion(config, q1);
    const r2 = scoreQuestion(config, q2);
    expect(r1.ok && r1.value.score).toBe(94);
    expect(r1.ok && r1.value.sectionImpacts.accuracy).toBe(10); // clamp(11, 0, 10)
    expect(r1.ok && r1.value.sectionImpacts.delivery).toBe(4);
    expect(r2.ok && r2.value.score).toBe(94);

    const jury = scoreJury(
      config,
      [1, 2],
      new Map([
        [1, q1],
        [2, q2],
      ]),
      { bonus: { amount: 3 } }
    );
    expect(jury.ok).toBe(true);
    if (jury.ok) {
      expect(jury.value.juryBase).toBe(94);
      expect(jury.value.juryFinal).toBe(97);
    }
  });

  it("Jury 2: Q1 voided (x=3), Q2=100, base=50, bonus=1, final=51", () => {
    const q1: QuestionValueMap = { accuracy: { x: 3, y: 0 }, delivery: { z: 0 } };
    const q2: QuestionValueMap = { accuracy: { x: 0, y: 0 }, delivery: { z: 0 } };

    const r1 = scoreQuestion(config, q1);
    expect(r1.ok && r1.value.score).toBe(0);
    expect(r1.ok && r1.value.terminalRuleId).toBe("x-void");
    expect(r1.ok && r1.value.sectionImpacts.accuracy).toBe(0);

    const jury = scoreJury(
      config,
      [1, 2],
      new Map([
        [1, q1],
        [2, q2],
      ]),
      { bonus: { amount: 1 } }
    );
    expect(jury.ok).toBe(true);
    if (jury.ok) {
      expect(jury.value.juryBase).toBe(50);
      expect(jury.value.juryFinal).toBe(51);
    }
  });

  it("Participant final = mean(97, 51) = 74", () => {
    const q1j1: QuestionValueMap = { accuracy: { x: 2, y: 2 }, delivery: { z: 2 } };
    const q2j1: QuestionValueMap = { accuracy: { x: 0, y: 4 }, delivery: { z: 0 } };
    const q1j2: QuestionValueMap = { accuracy: { x: 3, y: 0 }, delivery: { z: 0 } };
    const q2j2: QuestionValueMap = { accuracy: { x: 0, y: 0 }, delivery: { z: 0 } };

    const jury1 = scoreJury(
      config,
      [1, 2],
      new Map([
        [1, q1j1],
        [2, q2j1],
      ]),
      { bonus: { amount: 3 } }
    );
    const jury2 = scoreJury(
      config,
      [1, 2],
      new Map([
        [1, q1j2],
        [2, q2j2],
      ]),
      { bonus: { amount: 1 } }
    );
    expect(jury1.ok && jury1.value.juryFinal).toBe(97);
    expect(jury2.ok && jury2.value.juryFinal).toBe(51);

    if (jury1.ok && jury2.ok) {
      const participant = scoreParticipant(
        new Map([
          ["jury-1", jury1.value],
          ["jury-2", jury2.value],
        ])
      );
      expect(participant).toEqual({ ok: true, value: 74 });
    }
  });

  it("negative input fails validation and cannot add points via clamp", () => {
    const invalid: QuestionValueMap = { accuracy: { x: -1, y: 0 }, delivery: { z: 0 } };
    const validation = validateQuestionValues(config, invalid);
    expect(validation.ok).toBe(false);

    const result = scoreQuestion(config, invalid);
    expect(result.ok).toBe(false);

    // Even bypassing validation, the clamp invariant cannot let a negative
    // stored value add points: rawImpact = -1 * 4 = -4, clamp(-4, 0, cap) = 0.
    expect(clamp(-1 * 4, 0, 10)).toBe(0);
  });

  it("NaN and Infinity inputs fail validation", () => {
    const nanValues: QuestionValueMap = { accuracy: { x: NaN, y: 0 }, delivery: { z: 0 } };
    const infValues: QuestionValueMap = {
      accuracy: { x: Infinity, y: 0 },
      delivery: { z: 0 },
    };
    expect(validateQuestionValues(config, nanValues).ok).toBe(false);
    expect(validateQuestionValues(config, infValues).ok).toBe(false);
  });

  it("out-of-range and off-step inputs fail validation", () => {
    const outOfRange: QuestionValueMap = { accuracy: { x: 11, y: 0 }, delivery: { z: 0 } };
    const offStep: QuestionValueMap = { accuracy: { x: 1.5, y: 0 }, delivery: { z: 0 } };
    expect(validateQuestionValues(config, outOfRange).ok).toBe(false);
    expect(validateQuestionValues(config, offStep).ok).toBe(false);
  });

  it("missing or extra inputs fail validation", () => {
    const missing = { accuracy: { x: 1 }, delivery: { z: 0 } } as unknown as QuestionValueMap;
    const extra: QuestionValueMap = {
      accuracy: { x: 1, y: 0, extra: 1 } as unknown as Record<string, number>,
      delivery: { z: 0 },
    };
    expect(validateQuestionValues(config, missing).ok).toBe(false);
    expect(validateQuestionValues(config, extra).ok).toBe(false);
  });
});

describe("F6: scoreJury on an empty assignment/scores", () => {
  const config = buildTrialWeightedConfig();

  it("assignedQuestions: [] returns an incomplete-evaluation error, never NaN", () => {
    // The bug this guards: with zero assigned questions, `questionResults`
    // is empty and `juryBase = 0 / 0 = NaN` — a "success" result carrying
    // NaN, rather than an explicit error.
    const result = scoreJury(config, [], new Map(), { bonus: { amount: 0 } });
    expect(result).toEqual({
      ok: false,
      errors: ["incomplete evaluation: no assigned questions to score"],
    });
  });

  it("assigned questions present but zero scored (empty questionValues map) still errors, not NaN", () => {
    const result = scoreJury(config, [1, 2], new Map(), { bonus: { amount: 0 } });
    expect(result.ok).toBe(false);
  });
});

describe("Trial 3: trial-shapes-2026 (three subtractive weights, additive section, adjustments)", () => {
  const config = buildTrialShapesConfig();

  it("question score = 95.5; jury final = 96.5 with bonus +2 and penalty -1", () => {
    const values: QuestionValueMap = {
      precision: { a: 4, b: 1, c: 1 },
      flow: { d: 3 },
    };
    const result = scoreQuestion(config, values);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sectionImpacts.precision).toBe(6); // clamp(8, 0, 6)
      expect(result.value.sectionImpacts.flow).toBe(1.5);
      expect(result.value.score).toBe(95.5);
    }

    const jury = scoreJury(
      config,
      [1],
      new Map([[1, values]]),
      {
        overall_bonus: { amount: 2 },
        conduct_penalty: { amount: 1 },
      }
    );
    expect(jury.ok).toBe(true);
    if (jury.ok) {
      expect(jury.value.juryBase).toBe(95.5);
      expect(jury.value.juryFinal).toBe(96.5);
    }
  });
});

describe("Override action fixtures (design section 5, 'Override action fixtures')", () => {
  const config = buildOverrideMatrixConfig();
  const values = (flag: number): QuestionValueMap => ({ sec: { v: 1, flag } });

  it("1. setSectionImpact only: normal impact 6 overridden to 2", () => {
    const baseline = scoreQuestion(config, { sec: { v: 1, flag: 0 } });
    expect(baseline.ok && baseline.value.sectionImpacts.sec).toBe(6);

    const result = scoreQuestion(config, values(1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sectionImpacts.sec).toBe(2);
      expect(result.value.score).toBe(98); // 100 - 2
      expect(result.value.terminalRuleId).toBeNull();
    }
  });

  it("2. setQuestionScore only: score = 75, all section impacts = 0", () => {
    const result = scoreQuestion(config, values(2));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(75);
      expect(result.value.terminalRuleId).toBe("r2-set-score");
      expect(result.value.sectionImpacts.sec).toBe(0);
    }
  });

  it("3. voidQuestion only: score = 0, all section impacts = 0", () => {
    const result = scoreQuestion(config, values(3));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(0);
      expect(result.value.terminalRuleId).toBe("r3-void");
      expect(result.value.sectionImpacts.sec).toBe(0);
    }
  });

  it("4. section override followed by a terminal rule: terminal wins, all impacts 0", () => {
    const result = scoreQuestion(config, values(4));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(80);
      expect(result.value.terminalRuleId).toBe("r4b-terminal");
      expect(result.value.sectionImpacts.sec).toBe(0);
    }
  });

  it("5. terminal rule before a section override: later rule never evaluated", () => {
    const result = scoreQuestion(config, values(5));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(0);
      expect(result.value.terminalRuleId).toBe("r5a-terminal");
    }
  });

  it("6. multiple terminal matches: lower numeric priority wins", () => {
    const result = scoreQuestion(config, values(6));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(60);
      expect(result.value.terminalRuleId).toBe("r6a-lower-priority-score");
    }
  });

  it("7. multiple section overrides for one section: lower priority supplies the impact", () => {
    const result = scoreQuestion(config, values(7));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sectionImpacts.sec).toBe(1);
      expect(result.value.score).toBe(99);
      expect(result.value.terminalRuleId).toBeNull();
    }
  });
});
