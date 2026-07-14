import { Timestamp } from "firebase/firestore";
import { computeConfigContentHash, computeScoringFingerprint } from "./configHash";
import type {
  EventCategoryDefinition,
  EventEvaluationConfigV2,
  InformationalInputDefinition,
  ParticipantAdjustmentDefinition,
  QuestionOverrideRule,
  QuestionTypeDefinition,
  ScoredInputDefinition,
} from "./types";

/**
 * The neutral example/template `jury-first-v2` config, per
 * docs/migrations/phase-1-greenfield.md section 5 ("Trial event to build
 * against"). This is a template builder for provisioning new events (see
 * scripts/provision-event.mjs) — it is not read at runtime by any fallback
 * path. Every new event gets its own config document written by a
 * provisioning script; this module just builds one realistic example that
 * exercises weights, a section cap, a void rule, and both `add`/`subtract`
 * question-type operations plus an additive participant bonus.
 */

export const EXAMPLE_CONFIG_VERSION = "demo-2026-seed-v1";

export const counterInput = (
  id: string,
  order: number,
  label: string,
  role: "scored",
  perInputWeight: number,
  options?: { min?: number; max?: number; step?: number }
): ScoredInputDefinition => ({
  id,
  label: { default: label },
  order,
  control: "integerCounter",
  min: options?.min ?? 0,
  max: options?.max ?? 10,
  step: options?.step ?? 1,
  role,
  perInputWeight,
});

export const informationalCounter = (
  id: string,
  order: number,
  label: string
): InformationalInputDefinition => ({
  id,
  label: { default: label },
  order,
  control: "integerCounter",
  min: 0,
  max: 10,
  step: 1,
  role: "informational",
});

const questionTypes: Record<string, QuestionTypeDefinition> = {
  hifdh: {
    id: "hifdh",
    label: { default: "Hifdh (Memorisation)" },
    order: 1,
    operation: "subtract",
    perSectionDeductionCap: 50,
    inputCount: 3,
    inputs: [
      counterInput("judge_correction", 1, "Judge Correction", "scored", 3),
      counterInput("self_correction", 2, "Self Correction", "scored", 2),
      informationalCounter("stuck", 3, "Times Stuck"),
    ],
  },
  tajweed: {
    id: "tajweed",
    label: { default: "Tajweed" },
    order: 2,
    operation: "subtract",
    perSectionDeductionCap: 30,
    inputCount: 2,
    inputs: [
      counterInput("major", 1, "Major Mistake", "scored", 2),
      counterInput("minor", 2, "Minor Mistake", "scored", 1),
    ],
  },
  presentation: {
    id: "presentation",
    label: { default: "Presentation" },
    order: 3,
    operation: "add",
    perSectionAdditionCap: 5,
    inputCount: 1,
    inputs: [
      counterInput("fluency", 1, "Fluency", "scored", 1, {
        min: 0,
        max: 5,
        step: 1,
      }),
    ],
  },
};

const overrideRules: readonly QuestionOverrideRule[] = [
  {
    id: "hifdh-judge-correction-void",
    priority: 1,
    when: {
      kind: "all",
      conditions: [
        {
          input: { questionTypeId: "hifdh", inputId: "judge_correction" },
          operator: "gte",
          value: 3,
        },
      ],
    },
    action: { kind: "voidQuestion" },
  },
];

const participantAdjustments: Record<string, ParticipantAdjustmentDefinition> = {
  overall_bonus: {
    id: "overall_bonus",
    label: { default: "Overall Bonus" },
    order: 1,
    scope: "participantJury",
    operation: "add",
    additionCap: 5,
    inputCount: 1,
    inputs: [
      {
        id: "bonus",
        label: { default: "Overall Bonus" },
        order: 1,
        control: "slider",
        min: 0,
        max: 5,
        step: 1,
        role: "scored",
        perInputWeight: 1,
      },
    ],
  },
};

const slot = (questionNumber: number, startPage: number, endPage: number) => ({
  questionNumber,
  pageRange: { startPage, endPage },
});

const category = (
  id: string,
  order: number,
  slots: readonly [number, number][]
): EventCategoryDefinition => ({
  id,
  label: { default: id },
  order,
  questionCount: slots.length,
  questionSlots: slots.map(([start, end], index) => slot(index + 1, start, end)),
  // Phase 2 will resolve this to an actual stored asset; for now it's just
  // the ref a consumer (randomizer/big-screen) can point an <img> at.
  assetRef: `categories/${id}.png`,
});

/** The three example categories and their question-slot page ranges,
 * transcribed exactly from docs/migrations/phase-1-greenfield.md section 5. */
const categories: Record<string, EventCategoryDefinition> = {
  CAT_A: category("CAT_A", 1, [
    [3, 51],
    [52, 101],
  ]),
  CAT_B: category("CAT_B", 2, [
    [3, 135],
    [136, 268],
    [269, 401],
  ]),
  CAT_M: category("CAT_M", 3, [
    [582, 588],
    [589, 596],
  ]),
};

export const EXAMPLE_CATEGORY_QUESTION_COUNTS: Readonly<Record<string, number>> =
  Object.fromEntries(
    Object.entries(categories).map(([id, def]) => [id, def.questionCount])
  );

const scoringSection = {
  baseScorePerQuestion: 100,
  // Headroom above 100 for the `add` question type (presentation, cap 5).
  questionBounds: { min: 0, max: 105 },
  // Headroom above questionBounds.max for the additive overall bonus (cap 5).
  finalBounds: { min: 0, max: 110 },
  missingQuestionPolicy: "incompleteEvaluation" as const,
  outputDecimals: 2 as const,
  rounding: "ecmascript-math-round" as const,
};

async function computeExampleScoringFingerprint(): Promise<string> {
  return computeScoringFingerprint({
    scoring: scoringSection,
    categories,
    questionTypes,
    overrideRules,
    participantAdjustments,
  });
}

/**
 * Builds the example `jury-first-v2` config, computing `scoringFingerprint`
 * and `contentHash` from the same canonical fields a reader will
 * reconstruct. `provisionedAt` is the caller's choice (fixed in
 * tests/fixtures, wall clock in the offline provisioner) since it is
 * excluded from the hash.
 */
export async function buildExampleEvaluationConfig(
  provisionedAt: Timestamp
): Promise<EventEvaluationConfigV2> {
  const scoringFingerprint = await computeExampleScoringFingerprint();

  const withoutHash = {
    schemaVersion: 2 as const,
    configVersion: EXAMPLE_CONFIG_VERSION,
    scoringFingerprint,
    algorithmVersion: "jury-first-v2" as const,
    scoring: scoringSection,
    categories,
    questionTypes,
    overrideRules,
    participantAdjustments,
  };

  const contentHash = await computeConfigContentHash(withoutHash);

  return {
    ...withoutHash,
    contentHash,
    provisionedAt,
  };
}
