import { Timestamp } from "firebase/firestore";
import { canonicalStringify, computeConfigContentHash, sha256Hex } from "./configHash";
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
 * The bundled `legacy-lisbon-display-v1` config, per
 * docs/migrations/phase-1-evaluation-model.md section 2 ("Lisbon config
 * seed"). This is the ONLY config the bundled fallback may ever serve, and
 * only for the `lisbon-2025` allowlisted event when its `configPath`
 * document is missing or unreadable.
 */

export const LISBON_CONFIG_VERSION = "lisbon-2025-seed-v1";

const counterInput = (
  id: string,
  order: number,
  label: string,
  role: "scored",
  perInputWeight: number
): ScoredInputDefinition => ({
  id,
  label: { default: label },
  order,
  control: "integerCounter",
  min: 0,
  max: 10,
  step: 1,
  role,
  perInputWeight,
});

const informationalCounter = (
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
      informationalCounter("stuck_count", 3, "Times Stuck"),
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
  waqf_ibtida: {
    id: "waqf_ibtida",
    label: { default: "Waqf & Ibtida" },
    order: 3,
    operation: "subtract",
    perSectionDeductionCap: 10,
    inputCount: 2,
    inputs: [
      counterInput("incorrect", 1, "Incorrect Pause/Start", "scored", 0.3),
      counterInput("meaning", 2, "Alters Meaning", "scored", 0.7),
    ],
  },
  husn_al_ada: {
    id: "husn_al_ada",
    label: { default: "Husn al-Ada" },
    order: 4,
    operation: "subtract",
    perSectionDeductionCap: 10,
    inputCount: 1,
    inputs: [counterInput("mistake_count", 1, "Husn al-Ada mistakes", "scored", 1)],
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

const slot = (
  questionNumber: number,
  startPage: number,
  endPage: number,
  juzStart: number,
  juzEnd: number
) => ({
  questionNumber,
  pageRange: { startPage, endPage },
  sourceJuzRange: { start: juzStart, end: juzEnd },
});

const category = (
  id: string,
  order: number,
  juzStart: number,
  juzEnd: number,
  slots: readonly [number, number][]
): EventCategoryDefinition => ({
  id,
  label: { default: id },
  order,
  questionCount: slots.length,
  questionSlots: slots.map(([start, end], index) =>
    slot(index + 1, start, end, juzStart, juzEnd)
  ),
});

/** The fourteen leaf categories and their authoritative question-slot page
 * ranges, transcribed exactly from the design's category table. `X` ends at
 * page 53 and must not expand through Juz 3. */
const categories: Record<string, EventCategoryDefinition> = {
  A1: category("A1", 1, 1, 5, [
    [3, 51],
    [52, 101],
  ]),
  A2: category("A2", 2, 26, 30, [
    [502, 548],
    [549, 596],
  ]),
  B1: category("B1", 3, 1, 10, [
    [3, 101],
    [102, 201],
  ]),
  B2: category("B2", 4, 21, 30, [
    [402, 498],
    [499, 596],
  ]),
  C1: category("C1", 5, 1, 20, [
    [3, 135],
    [136, 268],
    [269, 401],
  ]),
  C2: category("C2", 6, 11, 30, [
    [202, 332],
    [333, 463],
    [464, 596],
  ]),
  D1: category("D1", 7, 1, 30, [
    [3, 200],
    [201, 398],
    [399, 596],
  ]),
  D2: category("D2", 8, 1, 30, [
    [3, 200],
    [201, 398],
    [399, 596],
  ]),
  M1: category("M1", 9, 30, 30, [
    [582, 588],
    [589, 596],
  ]),
  M2: category("M2", 10, 28, 28, [
    [542, 551],
    [552, 561],
  ]),
  X: category("X", 11, 1, 2.5, [
    [3, 27],
    [28, 53],
  ]),
  Y: category("Y", 12, 1, 15, [
    [3, 101],
    [102, 200],
    [201, 301],
  ]),
  W1: category("W1", 13, 1, 3, [
    [3, 21],
    [22, 40],
    [41, 61],
  ]),
  W2: category("W2", 14, 1, 30, [
    [3, 200],
    [201, 398],
    [399, 596],
  ]),
};

/** Lisbon expected question counts per category, mirroring
 * `getCategoryConfig(...).numQuestions` in src/lib/quranUtils.ts. Exposed so
 * pure Lisbon-compat calculations don't need to import the config object
 * just to look up a question count. */
export const LISBON_CATEGORY_QUESTION_COUNTS: Readonly<Record<string, number>> =
  Object.fromEntries(
    Object.entries(categories).map(([id, def]) => [id, def.questionCount])
  );

const scoringSection = {
  baseScorePerQuestion: 100,
  questionBounds: { min: 0, max: 100 },
  finalBounds: { min: 0, max: 105 },
  missingQuestionPolicy: "zeroInputsArePerfect" as const,
  outputDecimals: 2 as const,
  rounding: "ecmascript-math-round" as const,
};

async function computeLisbonScoringFingerprint(): Promise<string> {
  const canonicalInput = canonicalStringify({
    scoring: scoringSection,
    categories,
    questionTypes,
    overrideRules,
    participantAdjustments,
  });
  return sha256Hex(canonicalInput);
}

/**
 * Builds the bundled Lisbon config, computing `scoringFingerprint` and
 * `contentHash` from the same canonical fields a reader will reconstruct.
 * `provisionedAt` is the caller's choice (fixed in tests/fixtures, wall
 * clock in the offline provisioner) since it is excluded from the hash.
 */
export async function buildLisbonEvaluationConfig(
  provisionedAt: Timestamp
): Promise<EventEvaluationConfigV2> {
  const scoringFingerprint = await computeLisbonScoringFingerprint();

  const withoutHash = {
    schemaVersion: 2 as const,
    configVersion: LISBON_CONFIG_VERSION,
    scoringFingerprint,
    algorithmVersion: "legacy-lisbon-display-v1" as const,
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
