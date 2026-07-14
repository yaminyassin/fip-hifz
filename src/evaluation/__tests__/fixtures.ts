import { Timestamp } from "firebase/firestore";
import type {
  EventCategoryDefinition,
  EventEvaluationConfigV2,
  ParticipantAdjustmentDefinition,
  QuestionOverrideRule,
  QuestionTypeDefinition,
} from "../types";

/**
 * Non-test fixture builders shared by the pure scoring-engine test suite.
 * Deliberately outside `*.test.ts` naming so vitest never collects this
 * file as a test target itself.
 */

const FIXED_TIMESTAMP = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

function baseConfig(
  overrides: Partial<EventEvaluationConfigV2>
): EventEvaluationConfigV2 {
  return {
    schemaVersion: 2,
    configVersion: "fixture-v1",
    contentHash: "fixture-hash",
    scoringFingerprint: "fixture-fingerprint",
    algorithmVersion: "jury-first-v2",
    scoring: {
      baseScorePerQuestion: 100,
      questionBounds: { min: 0, max: 100 },
      finalBounds: { min: 0, max: 100 },
      missingQuestionPolicy: "incompleteEvaluation",
      outputDecimals: 2,
      rounding: "ecmascript-math-round",
    },
    categories: {},
    questionTypes: {},
    overrideRules: [],
    participantAdjustments: {},
    provisionedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

/**
 * Trial 2 (`trial-weighted-2026`): decimal weights, a subtractive section,
 * an additive section, a terminal void, and an additive participant
 * adjustment. See docs/migrations/phase-1-evaluation-model.md section 5,
 * "Trial 2: trial-weighted-2026".
 */
export function buildTrialWeightedConfig(): EventEvaluationConfigV2 {
  const categories: Record<string, EventCategoryDefinition> = {
    S: {
      id: "S",
      label: { default: "S" },
      order: 1,
      questionCount: 2,
      questionSlots: [
        { questionNumber: 1, pageRange: { startPage: 42, endPage: 47 } },
        { questionNumber: 2, pageRange: { startPage: 48, endPage: 53 } },
      ],
    },
  };

  const questionTypes: Record<string, QuestionTypeDefinition> = {
    accuracy: {
      id: "accuracy",
      label: { default: "Accuracy" },
      order: 1,
      operation: "subtract",
      perSectionDeductionCap: 10,
      inputCount: 2,
      inputs: [
        {
          id: "x",
          label: { default: "x" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 4,
        },
        {
          id: "y",
          label: { default: "y" },
          order: 2,
          control: "decimalCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 1.5,
        },
      ],
    },
    delivery: {
      id: "delivery",
      label: { default: "Delivery" },
      order: 2,
      operation: "add",
      perSectionAdditionCap: 4,
      inputCount: 1,
      inputs: [
        {
          id: "z",
          label: { default: "z" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 2,
        },
      ],
    },
  };

  const overrideRules: readonly QuestionOverrideRule[] = [
    {
      id: "x-void",
      priority: 1,
      when: {
        kind: "all",
        conditions: [
          {
            input: { questionTypeId: "accuracy", inputId: "x" },
            operator: "gte",
            value: 3,
          },
        ],
      },
      action: { kind: "voidQuestion" },
    },
  ];

  const participantAdjustments: Record<string, ParticipantAdjustmentDefinition> = {
    bonus: {
      id: "bonus",
      label: { default: "Bonus" },
      order: 1,
      scope: "participantJury",
      operation: "add",
      additionCap: 3,
      inputCount: 1,
      inputs: [
        {
          id: "amount",
          label: { default: "Amount" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 1,
        },
      ],
    },
  };

  return baseConfig({
    configVersion: "trial-weighted-2026-v1",
    algorithmVersion: "jury-first-v2",
    scoring: {
      baseScorePerQuestion: 100,
      questionBounds: { min: 0, max: 100 },
      finalBounds: { min: 0, max: 100 },
      missingQuestionPolicy: "incompleteEvaluation",
      outputDecimals: 2,
      rounding: "ecmascript-math-round",
    },
    categories,
    questionTypes,
    overrideRules,
    participantAdjustments,
  });
}

/**
 * Trial 3 (`trial-shapes-2026`) base numeric fixture: three subtractive
 * weights, one additive weight, an additive overall bonus, and a
 * subtractive participant/jury adjustment. See design section 5, "Trial 3:
 * trial-shapes-2026".
 */
export function buildTrialShapesConfig(): EventEvaluationConfigV2 {
  const categories: Record<string, EventCategoryDefinition> = {
    ONE: {
      id: "ONE",
      label: { default: "ONE" },
      order: 1,
      questionCount: 1,
      questionSlots: [{ questionNumber: 1, pageRange: { startPage: 10, endPage: 10 } }],
    },
    FOUR: {
      id: "FOUR",
      label: { default: "FOUR" },
      order: 2,
      questionCount: 4,
      questionSlots: [
        { questionNumber: 1, pageRange: { startPage: 20, endPage: 20 } },
        { questionNumber: 2, pageRange: { startPage: 21, endPage: 21 } },
        { questionNumber: 3, pageRange: { startPage: 22, endPage: 22 } },
        { questionNumber: 4, pageRange: { startPage: 23, endPage: 23 } },
      ],
    },
  };

  const questionTypes: Record<string, QuestionTypeDefinition> = {
    precision: {
      id: "precision",
      label: { default: "Precision" },
      order: 1,
      operation: "subtract",
      perSectionDeductionCap: 6,
      inputCount: 3,
      inputs: [
        {
          id: "a",
          label: { default: "a" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 0.25,
        },
        {
          id: "b",
          label: { default: "b" },
          order: 2,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 2,
        },
        {
          id: "c",
          label: { default: "c" },
          order: 3,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 5,
        },
      ],
    },
    flow: {
      id: "flow",
      label: { default: "Flow" },
      order: 2,
      operation: "add",
      perSectionAdditionCap: 2.5,
      inputCount: 1,
      inputs: [
        {
          id: "d",
          label: { default: "d" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 0.5,
        },
      ],
    },
  };

  const participantAdjustments: Record<string, ParticipantAdjustmentDefinition> = {
    overall_bonus: {
      id: "overall_bonus",
      label: { default: "Overall bonus" },
      order: 1,
      scope: "participantJury",
      operation: "add",
      additionCap: 5,
      inputCount: 1,
      inputs: [
        {
          id: "amount",
          label: { default: "Amount" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 1,
        },
      ],
    },
    conduct_penalty: {
      id: "conduct_penalty",
      label: { default: "Conduct penalty" },
      order: 2,
      scope: "participantJury",
      operation: "subtract",
      deductionCap: 5,
      inputCount: 1,
      inputs: [
        {
          id: "amount",
          label: { default: "Amount" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 1,
        },
      ],
    },
  };

  return baseConfig({
    configVersion: "trial-shapes-2026-v1",
    algorithmVersion: "jury-first-v2",
    scoring: {
      baseScorePerQuestion: 100,
      questionBounds: { min: 0, max: 100 },
      finalBounds: { min: 0, max: 100 },
      missingQuestionPolicy: "incompleteEvaluation",
      outputDecimals: 2,
      rounding: "ecmascript-math-round",
    },
    categories,
    questionTypes,
    overrideRules: [],
    participantAdjustments,
  });
}

/**
 * A minimal single-section config purpose-built for the eight override
 * action/combination fixtures in design section 5 ("Override action
 * fixtures"). Each case is selected by a distinct `flag` value so all eight
 * rules can coexist in one validated config without cross-triggering.
 */
export function buildOverrideMatrixConfig(): EventEvaluationConfigV2 {
  const questionTypes: Record<string, QuestionTypeDefinition> = {
    sec: {
      id: "sec",
      label: { default: "Section" },
      order: 1,
      operation: "subtract",
      perSectionDeductionCap: 6,
      inputCount: 2,
      inputs: [
        {
          id: "v",
          label: { default: "v" },
          order: 1,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "scored",
          perInputWeight: 6,
        },
        {
          id: "flag",
          label: { default: "flag" },
          order: 2,
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          role: "informational",
        },
      ],
    },
  };

  const flagCondition = (value: number) => ({
    input: { questionTypeId: "sec", inputId: "flag" },
    operator: "eq" as const,
    value,
  });

  const overrideRules: readonly QuestionOverrideRule[] = [
    // Case 1: setSectionImpact only.
    {
      id: "r1-section-only",
      priority: 10,
      when: { kind: "all", conditions: [flagCondition(1)] },
      action: { kind: "setSectionImpact", questionTypeId: "sec", impact: 2 },
    },
    // Case 2: setQuestionScore only.
    {
      id: "r2-set-score",
      priority: 20,
      when: { kind: "all", conditions: [flagCondition(2)] },
      action: { kind: "setQuestionScore", score: 75 },
    },
    // Case 3: voidQuestion only.
    {
      id: "r3-void",
      priority: 30,
      when: { kind: "all", conditions: [flagCondition(3)] },
      action: { kind: "voidQuestion" },
    },
    // Case 4: section override followed by a terminal rule — terminal wins.
    {
      id: "r4a-section",
      priority: 40,
      when: { kind: "all", conditions: [flagCondition(4)] },
      action: { kind: "setSectionImpact", questionTypeId: "sec", impact: 3 },
    },
    {
      id: "r4b-terminal",
      priority: 41,
      when: { kind: "all", conditions: [flagCondition(4)] },
      action: { kind: "setQuestionScore", score: 80 },
    },
    // Case 5: terminal rule before a section override — later rule unreached.
    {
      id: "r5a-terminal",
      priority: 50,
      when: { kind: "all", conditions: [flagCondition(5)] },
      action: { kind: "voidQuestion" },
    },
    {
      id: "r5b-section",
      priority: 51,
      when: { kind: "all", conditions: [flagCondition(5)] },
      action: { kind: "setSectionImpact", questionTypeId: "sec", impact: 1 },
    },
    // Case 6: multiple terminal matches — lower priority wins.
    {
      id: "r6a-lower-priority-score",
      priority: 60,
      when: { kind: "all", conditions: [flagCondition(6)] },
      action: { kind: "setQuestionScore", score: 60 },
    },
    {
      id: "r6b-higher-priority-void",
      priority: 61,
      when: { kind: "all", conditions: [flagCondition(6)] },
      action: { kind: "voidQuestion" },
    },
    // Case 7: multiple section overrides for one section — lower priority wins.
    {
      id: "r7a-lower-priority-section",
      priority: 70,
      when: { kind: "all", conditions: [flagCondition(7)] },
      action: { kind: "setSectionImpact", questionTypeId: "sec", impact: 1 },
    },
    {
      id: "r7b-higher-priority-section",
      priority: 71,
      when: { kind: "all", conditions: [flagCondition(7)] },
      action: { kind: "setSectionImpact", questionTypeId: "sec", impact: 4 },
    },
  ];

  return baseConfig({
    configVersion: "override-matrix-v1",
    algorithmVersion: "jury-first-v2",
    questionTypes,
    overrideRules,
  });
}

/** Case 8: two rules sharing one priority — config parsing must fail. */
export function buildPriorityTieConfig(): unknown {
  const config = buildOverrideMatrixConfig();
  const tiedRules: QuestionOverrideRule[] = [
    {
      id: "tie-a",
      priority: 5,
      when: {
        kind: "all",
        conditions: [
          {
            input: { questionTypeId: "sec", inputId: "flag" },
            operator: "eq",
            value: 9,
          },
        ],
      },
      action: { kind: "voidQuestion" },
    },
    {
      id: "tie-b",
      priority: 5,
      when: {
        kind: "all",
        conditions: [
          {
            input: { questionTypeId: "sec", inputId: "flag" },
            operator: "eq",
            value: 9,
          },
        ],
      },
      action: { kind: "setQuestionScore", score: 10 },
    },
  ];
  return { ...config, overrideRules: [...config.overrideRules, ...tiedRules] };
}
