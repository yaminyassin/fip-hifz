import { describe, expect, it } from "vitest";
import { validateEvaluationConfig } from "../configValidation";
import { canonicalStringify } from "../configHash";
import { buildExampleEvaluationConfig } from "../exampleConfigSeed";
import {
  buildOverrideMatrixConfig,
  buildPriorityTieConfig,
  buildTrialShapesConfig,
  buildTrialWeightedConfig,
} from "./fixtures";
import type { EventEvaluationConfigV2 } from "../types";
import { Timestamp } from "firebase/firestore";

describe("validateEvaluationConfig: accepts valid configs", () => {
  it("accepts the example seed config", async () => {
    const config = await buildExampleEvaluationConfig(Timestamp.now());
    const result = validateEvaluationConfig(config);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts trial-weighted-2026", () => {
    const result = validateEvaluationConfig(buildTrialWeightedConfig());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts trial-shapes-2026", () => {
    const result = validateEvaluationConfig(buildTrialShapesConfig());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts the override matrix config", () => {
    const result = validateEvaluationConfig(buildOverrideMatrixConfig());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("validateEvaluationConfig: rejects invalid configs", () => {
  const valid = buildTrialWeightedConfig();

  const mutate = (fn: (c: EventEvaluationConfigV2) => EventEvaluationConfigV2) =>
    validateEvaluationConfig(fn({
      ...structuredClone(valid),
      provisionedAt: valid.provisionedAt,
    }));

  it("rejects unsupported rounding and output decimal semantics", () => {
    const config = structuredClone(valid) as unknown as Record<string, unknown>;
    config.scoring = {
      ...(config.scoring as Record<string, unknown>),
      outputDecimals: 9,
      rounding: "floor",
    };
    const result = validateEvaluationConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "scoring.outputDecimals must be exactly 2",
      'scoring.rounding must be "ecmascript-math-round"',
    ]));
  });

  it("rejects missing localized labels and non-string translations", () => {
    const config = structuredClone(valid) as unknown as Record<string, unknown>;
    const categories = config.categories as Record<string, Record<string, unknown>>;
    delete categories.S.label;
    const questionTypes = config.questionTypes as Record<string, Record<string, unknown>>;
    questionTypes.accuracy.label = { default: "Accuracy", translations: { pt: 7 } };
    const result = validateEvaluationConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("categories.S.label"))).toBe(true);
    expect(result.errors.some((error) => error.includes("translations values"))).toBe(true);
  });

  it("rejects malformed collection shapes and timestamps without throwing", () => {
    const config = structuredClone(valid) as unknown as Record<string, unknown>;
    config.categories = [];
    config.provisionedAt = "not-a-timestamp";
    const result = validateEvaluationConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "categories is required and must be an object",
      "provisionedAt must be a Firestore Timestamp",
    ]));
  });

  it.each([
    { seconds: 1, nanoseconds: 0 },
    { _seconds: 1, _nanoseconds: 0 },
  ])("rejects plain timestamp-shaped maps: %o", (provisionedAt) => {
    const result = validateEvaluationConfig({ ...valid, provisionedAt });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("provisionedAt must be a Firestore Timestamp");
  });

  it.each([
    {
      level: "config root",
      addExtra: (config: Record<string, unknown>) => {
        config.unexpected = true;
        return "config.unexpected";
      },
    },
    {
      level: "scoring",
      addExtra: (config: Record<string, unknown>) => {
        (config.scoring as Record<string, unknown>).unexpected = true;
        return "scoring.unexpected";
      },
    },
    {
      level: "category",
      addExtra: (config: Record<string, unknown>) => {
        const categories = config.categories as Record<string, Record<string, unknown>>;
        categories.S.unexpected = true;
        return "categories.S.unexpected";
      },
    },
    {
      level: "question slot",
      addExtra: (config: Record<string, unknown>) => {
        const categories = config.categories as Record<string, Record<string, unknown>>;
        const slots = categories.S.questionSlots as Record<string, unknown>[];
        slots[0].unexpected = true;
        return "categories.S.questionSlots[0].unexpected";
      },
    },
    {
      level: "question type",
      addExtra: (config: Record<string, unknown>) => {
        const questionTypes = config.questionTypes as Record<string, Record<string, unknown>>;
        questionTypes.accuracy.unexpected = true;
        return "questionTypes.accuracy.unexpected";
      },
    },
    {
      level: "input",
      addExtra: (config: Record<string, unknown>) => {
        const questionTypes = config.questionTypes as Record<string, Record<string, unknown>>;
        const inputs = questionTypes.accuracy.inputs as Record<string, unknown>[];
        inputs[0].unexpected = true;
        return "questionTypes.accuracy.inputs[0].unexpected";
      },
    },
    {
      level: "override rule",
      addExtra: (config: Record<string, unknown>) => {
        config.overrideRules = [{
          id: "strict-shape",
          priority: 99,
          when: {
            kind: "all",
            conditions: [
              { input: { questionTypeId: "accuracy", inputId: "x" }, operator: "gte", value: 1 },
            ],
          },
          action: { kind: "voidQuestion" },
          unexpected: true,
        }];
        return "overrideRules[0].unexpected";
      },
    },
    {
      level: "override rule action (nested)",
      addExtra: (config: Record<string, unknown>) => {
        config.overrideRules = [{
          id: "strict-action",
          priority: 42,
          when: {
            kind: "all",
            conditions: [
              { input: { questionTypeId: "accuracy", inputId: "x" }, operator: "gte", value: 1 },
            ],
          },
          // A voidQuestion action carries no score; a stray score field would
          // otherwise pollute the scoring fingerprint.
          action: { kind: "voidQuestion", score: 100 },
        }];
        return "overrideRules[0].action.score";
      },
    },
    {
      level: "participant adjustment",
      addExtra: (config: Record<string, unknown>) => {
        const adjustments = config.participantAdjustments as Record<string, Record<string, unknown>>;
        adjustments.bonus.unexpected = true;
        return "participantAdjustments.bonus.unexpected";
      },
    },
  ])("rejects unknown fields at the $level level", ({ addExtra }) => {
    const config = {
      ...structuredClone(valid),
      provisionedAt: valid.provisionedAt,
    } as unknown as Record<string, unknown>;
    const expectedError = addExtra(config);

    const result = validateEvaluationConfig(config);

    expect(result.ok).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain(`${expectedError} is not a known field`);
  });

  it("rejects a non-string override-rule id", () => {
    const config = {
      ...structuredClone(valid),
      provisionedAt: valid.provisionedAt,
    } as unknown as Record<string, unknown>;
    config.overrideRules = [{
      id: 42,
      priority: 7,
      when: {
        kind: "all",
        conditions: [
          { input: { questionTypeId: "accuracy", inputId: "x" }, operator: "gte", value: 1 },
        ],
      },
      action: { kind: "voidQuestion" },
    }];

    const result = validateEvaluationConfig(config);

    expect(result.ok).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain("overrideRules[0].id must be a non-empty string");
  });

  it("measures the 64 KiB limit identically for Web and Admin Timestamp shapes", () => {
    const timestampShapes = [
      {
        seconds: 1,
        nanoseconds: 2,
        toMillis: () => 1_000,
        toDate: () => new Date(1_000),
      },
      {
        _seconds: 1,
        _nanoseconds: 2,
        toMillis: () => 1_000,
        toDate: () => new Date(1_000),
      },
    ];
    const configAtSize = (targetBytes: number, provisionedAt: unknown) => {
      const config = {
        ...structuredClone(valid),
        configVersion: "",
        provisionedAt,
      } as unknown as Record<string, unknown>;
      const sizeInput = Object.fromEntries(
        Object.entries(config).filter(([key]) => key !== "provisionedAt")
      );
      const baseBytes = new TextEncoder().encode(canonicalStringify(sizeInput)).length;
      config.configVersion = "x".repeat(targetBytes - baseBytes);
      return config;
    };

    for (const provisionedAt of timestampShapes) {
      expect(validateEvaluationConfig(configAtSize(64 * 1024, provisionedAt)).ok).toBe(true);
      const overBudget = validateEvaluationConfig(configAtSize(64 * 1024 + 1, provisionedAt));
      expect(overBudget.ok).toBe(false);
      expect(overBudget.errors).toContain(
        "config canonical size 65537 bytes exceeds 65536 byte budget"
      );
    }
  });

  it("rejects a priority tie", () => {
    const result = validateEvaluationConfig(buildPriorityTieConfig());
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("share priority"))).toBe(true);
  });

  it("rejects duplicate category ids", () => {
    const result = mutate((c) => {
      const categories = { ...c.categories };
      const s = categories.S;
      categories.S2 = { ...s, id: "S" };
      return { ...c, categories };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate category id"))).toBe(true);
  });

  it("rejects duplicate order values within a list", () => {
    const result = mutate((c) => {
      const categories = { ...c.categories };
      categories.S = { ...categories.S, order: 1 };
      // A second category with the same order 1 as an existing one.
      categories.S2 = { ...categories.S, id: "S2", order: 1 };
      return { ...c, categories };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate order"))).toBe(true);
  });

  it("rejects inputCount mismatch", () => {
    const result = mutate((c) => {
      const questionTypes = { ...c.questionTypes };
      questionTypes.accuracy = { ...questionTypes.accuracy, inputCount: 5 };
      return { ...c, questionTypes };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("inputCount"))).toBe(true);
  });

  it("rejects questionCount < 1", () => {
    const result = mutate((c) => {
      const categories = { ...c.categories };
      categories.S = { ...categories.S, questionCount: 0, questionSlots: [] };
      return { ...c, categories };
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("questionCount must be a finite integer >= 1"))
    ).toBe(true);
  });

  it("rejects invalid page ranges (startPage > endPage)", () => {
    const result = mutate((c) => {
      const categories = { ...c.categories };
      categories.S = {
        ...categories.S,
        questionSlots: [
          { questionNumber: 1, pageRange: { startPage: 50, endPage: 40 } },
          categories.S.questionSlots[1],
        ],
      };
      return { ...c, categories };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("pageRange"))).toBe(true);
  });

  it("rejects missing question slots (questionCount mismatch)", () => {
    const result = mutate((c) => {
      const categories = { ...c.categories };
      categories.S = { ...categories.S, questionSlots: [categories.S.questionSlots[0]] };
      return { ...c, categories };
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("questionCount must equal questionSlots.length"))
    ).toBe(true);
  });

  it("rejects a condition referencing an unknown input", () => {
    const result = mutate((c) => ({
      ...c,
      overrideRules: [
        {
          id: "bad",
          priority: 99,
          when: {
            kind: "all",
            conditions: [
              {
                input: { questionTypeId: "accuracy", inputId: "does-not-exist" },
                operator: "gte",
                value: 1,
              },
            ],
          },
          action: { kind: "voidQuestion" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown section or input"))).toBe(true);
  });

  it("rejects a negative section cap", () => {
    const result = mutate((c) => {
      const questionTypes = { ...c.questionTypes };
      const accuracy = questionTypes.accuracy;
      questionTypes.accuracy =
        accuracy.operation === "subtract"
          ? { ...accuracy, perSectionDeductionCap: -1 }
          : accuracy;
      return { ...c, questionTypes };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("section cap"))).toBe(true);
  });

  it("rejects a nonpositive scored weight", () => {
    const result = mutate((c) => {
      const questionTypes = { ...c.questionTypes };
      questionTypes.accuracy = {
        ...questionTypes.accuracy,
        inputs: questionTypes.accuracy.inputs.map((i) =>
          i.id === "x" ? { ...i, perInputWeight: 0 } : i
        ) as typeof questionTypes.accuracy.inputs,
      };
      return { ...c, questionTypes };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("perInputWeight"))).toBe(true);
  });

  it("rejects a nonpositive step", () => {
    const result = mutate((c) => {
      const questionTypes = { ...c.questionTypes };
      questionTypes.accuracy = {
        ...questionTypes.accuracy,
        inputs: questionTypes.accuracy.inputs.map((i) =>
          i.id === "x" ? { ...i, step: 0 } : i
        ) as typeof questionTypes.accuracy.inputs,
      };
      return { ...c, questionTypes };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("step must be > 0"))).toBe(true);
  });

  it("rejects input min > max", () => {
    const result = mutate((c) => {
      const questionTypes = { ...c.questionTypes };
      questionTypes.accuracy = {
        ...questionTypes.accuracy,
        inputs: questionTypes.accuracy.inputs.map((i) =>
          i.id === "x" ? { ...i, min: 5, max: 1 } : i
        ) as typeof questionTypes.accuracy.inputs,
      };
      return { ...c, questionTypes };
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("0 <= min <= max"))).toBe(true);
  });

  it("rejects inverted questionBounds", () => {
    const result = mutate((c) => ({
      ...c,
      scoring: { ...c.scoring, questionBounds: { min: 100, max: 0 } },
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("questionBounds.min must be <= max"))).toBe(
      true
    );
  });

  it("rejects inverted finalBounds", () => {
    const result = mutate((c) => ({
      ...c,
      scoring: { ...c.scoring, finalBounds: { min: 100, max: 0 } },
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("finalBounds.min must be <= max"))).toBe(true);
  });

  it("rejects a base score outside questionBounds", () => {
    const result = mutate((c) => ({
      ...c,
      scoring: { ...c.scoring, baseScorePerQuestion: 1000 },
    }));
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("baseScorePerQuestion must be within questionBounds"))
    ).toBe(true);
  });

  it("rejects a non-finite condition value", () => {
    const result = mutate((c) => ({
      ...c,
      overrideRules: [
        {
          id: "bad",
          priority: 99,
          when: {
            kind: "all",
            conditions: [
              {
                input: { questionTypeId: "accuracy", inputId: "x" },
                operator: "gte",
                value: NaN,
              },
            ],
          },
          action: { kind: "voidQuestion" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("condition value must be finite"))
    ).toBe(true);
  });

  it("rejects a non-finite setSectionImpact impact", () => {
    const result = mutate((c) => ({
      ...c,
      overrideRules: [
        {
          id: "bad",
          priority: 99,
          when: {
            kind: "all",
            conditions: [
              {
                input: { questionTypeId: "accuracy", inputId: "x" },
                operator: "gte",
                value: 1,
              },
            ],
          },
          action: { kind: "setSectionImpact", questionTypeId: "accuracy", impact: Infinity },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("setSectionImpact impact"))).toBe(true);
  });

  it("rejects a non-finite setQuestionScore score", () => {
    const result = mutate((c) => ({
      ...c,
      overrideRules: [
        {
          id: "bad",
          priority: 99,
          when: {
            kind: "all",
            conditions: [
              {
                input: { questionTypeId: "accuracy", inputId: "x" },
                operator: "gte",
                value: 1,
              },
            ],
          },
          action: { kind: "setQuestionScore", score: NaN },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("setQuestionScore score"))).toBe(true);
  });

  it("rejects an empty condition list", () => {
    const result = mutate((c) => ({
      ...c,
      overrideRules: [
        {
          id: "bad",
          priority: 99,
          when: { kind: "all", conditions: [] },
          action: { kind: "voidQuestion" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("condition list must be non-empty"))).toBe(
      true
    );
  });

  // F3: the validator must be a complete boundary parser. Before this fix,
  // each of the next four cases silently passed validation and either let
  // the engine crash later (`config.overrideRules.slice()` on `undefined`)
  // or let semantically broken config through unflagged.

  it("rejects a config with overrideRules deleted (undefined), instead of letting scoreQuestion crash later", async () => {
    const { scoreQuestion } = await import("../scoringEngine");

    const withoutOverrideRules = structuredClone(valid) as Partial<EventEvaluationConfigV2>;
    delete withoutOverrideRules.overrideRules;

    const result = validateEvaluationConfig(withoutOverrideRules);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("overrideRules"))).toBe(true);
    expect(result.config).toBeNull();

    // Validation is the real guard: this object is rejected above, so it must
    // never reach the engine. This assertion documents that IF a caller bypassed
    // `result.ok` and forced the rejected object in, `scoreQuestion` fails loudly
    // (throws on `.slice()` of a missing `overrideRules`) rather than silently
    // scoring garbage — i.e. there is no silent-corruption path past validation.
    const brokenConfig = withoutOverrideRules as unknown as EventEvaluationConfigV2;
    expect(() =>
      scoreQuestion(brokenConfig, { accuracy: { x: 0, y: 0 }, delivery: { z: 0 } })
    ).toThrow();
  });

  it("rejects a category whose record key does not match its embedded id", () => {
    const result = mutate((c) => {
      const categories = { ...c.categories };
      // Key "S" now holds a category whose embedded `id` is "T" — nothing
      // upstream can tell which one is authoritative.
      categories.S = { ...categories.S, id: "T" };
      return { ...c, categories };
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("does not match its embedded id"))
    ).toBe(true);
  });

  it("rejects a questionType whose record key does not match its embedded id", () => {
    const result = mutate((c) => {
      const questionTypes = { ...c.questionTypes };
      questionTypes.accuracy = { ...questionTypes.accuracy, id: "not-accuracy" };
      return { ...c, questionTypes };
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("does not match its embedded id"))
    ).toBe(true);
  });

  it("rejects a participantAdjustment whose record key does not match its embedded id", () => {
    const result = mutate((c) => {
      const participantAdjustments = { ...c.participantAdjustments };
      participantAdjustments.bonus = { ...participantAdjustments.bonus, id: "not-bonus" };
      return { ...c, participantAdjustments };
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("does not match its embedded id"))
    ).toBe(true);
  });

  it('rejects an unknown when.kind (not "all" or "any")', () => {
    const result = mutate((c) => ({
      ...c,
      overrideRules: [
        {
          id: "bad",
          priority: 99,
          when: {
            kind: "xor" as unknown as "all",
            conditions: [
              { input: { questionTypeId: "accuracy", inputId: "x" }, operator: "gte", value: 1 },
            ],
          },
          action: { kind: "voidQuestion" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('when.kind must be "all" or "any"'))).toBe(
      true
    );
  });

  it("rejects an unknown condition operator", () => {
    const result = mutate((c) => ({
      ...c,
      overrideRules: [
        {
          id: "bad",
          priority: 99,
          when: {
            kind: "all",
            conditions: [
              {
                input: { questionTypeId: "accuracy", inputId: "x" },
                operator: "between" as unknown as "gte",
                value: 1,
              },
            ],
          },
          action: { kind: "voidQuestion" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("condition operator") && e.includes("unknown"))).toBe(
      true
    );
  });

  it("the engine never crashes on a config that passed validation (example, trial-weighted, trial-shapes, override matrix)", async () => {
    const { scoreQuestion } = await import("../scoringEngine");
    const { buildExampleEvaluationConfig } = await import("../exampleConfigSeed");
    const { buildTrialShapesConfig, buildOverrideMatrixConfig } = await import("./fixtures");
    const { Timestamp: FirestoreTimestamp } = await import("firebase/firestore");

    const configs = [
      await buildExampleEvaluationConfig(FirestoreTimestamp.now()),
      buildTrialWeightedConfig(),
      buildTrialShapesConfig(),
      buildOverrideMatrixConfig(),
    ];

    for (const config of configs) {
      expect(validateEvaluationConfig(config).ok).toBe(true);
      const values = Object.fromEntries(
        Object.values(config.questionTypes).map((section) => [
          section.id,
          Object.fromEntries(section.inputs.map((input) => [input.id, input.min])),
        ])
      );
      expect(() => scoreQuestion(config, values)).not.toThrow();
    }
  });
});
