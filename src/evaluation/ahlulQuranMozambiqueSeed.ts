import { Timestamp } from "firebase/firestore";
import { computeConfigContentHash, computeScoringFingerprint } from "./configHash";
import { juzToPageMap } from "../lib/quranUtils";
import type {
  CategoryQuestionSlot,
  EventCategoryDefinition,
  EventEvaluationConfigV2,
  ParticipantAdjustmentDefinition,
  QuestionOverrideRule,
  QuestionTypeDefinition,
  ScoredInputDefinition,
  InformationalInputDefinition,
} from "./types";

/**
 * The `jury-first-v2` config for the Ahlul Qur'an International Competition —
 * Mozambique, transcribed from the organizer's category sheet. The scheme is
 * documented in docs/ahlul-quran-mozambique-event.md.
 *
 * Two things make this a real config rather than a copy of
 * `exampleConfigSeed.ts`:
 *
 * 1. CATEGORIES ARE DERIVED, NOT TRANSCRIBED. Every category is declared as a
 *    Juz span plus a question count; the authoritative `pageRange` for each
 *    question slot is computed from `juzToPageMap` by `splitIntoSlots`. This
 *    is exactly the build-time authoring use that map documents, and it means
 *    a page range can never silently disagree with the Juz span it claims to
 *    cover. `ahlulQuranMozambiqueSeed.test.ts` pins the derivation against the
 *    ranges published in docs/migrations/phase-1-evaluation-model.md.
 *
 * 2. TAJWEED HAS ONE INPUT, NOT TWO. The Lisbon rubric this event otherwise
 *    follows scores Tajweed as major (weight 2) + minor (weight 1). This event
 *    scores minor mistakes only, per the organizer. There is deliberately no
 *    `major` input left behind at weight 0 — a scored input must have a weight
 *    > 0, and an unused input would still be rendered to every juror.
 */

export const AHLUL_QURAN_MOZAMBIQUE_EVENT_ID =
  "ahlul-quran-international-competition---mozambique";

export const AHLUL_QURAN_MOZAMBIQUE_CONFIG_VERSION =
  "ahlul-quran-mozambique-v1";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

interface CategorySpec {
  id: string;
  label: string;
  /** Inclusive Juz span, as written on the organizer's sheet. */
  juz: { start: number; end: number };
  questionCount: number;
}

/** The organizer's sheet, verbatim. "(n Q)" is the question count. */
const CATEGORY_SPECS: readonly CategorySpec[] = [
  { id: "A1", label: "A1 — 1 Juz (Juz Amma)", juz: { start: 30, end: 30 }, questionCount: 2 },
  { id: "A2", label: "A2 — 1 Juz (Alif Lam Mim)", juz: { start: 1, end: 1 }, questionCount: 2 },
  { id: "B1", label: "B1 — First 5 Juz", juz: { start: 1, end: 5 }, questionCount: 2 },
  { id: "B2", label: "B2 — Last 5 Juz", juz: { start: 26, end: 30 }, questionCount: 2 },
  { id: "C1", label: "C1 — First 15 Juz", juz: { start: 1, end: 15 }, questionCount: 3 },
  { id: "C2", label: "C2 — Last 15 Juz", juz: { start: 16, end: 30 }, questionCount: 3 },
  { id: "D", label: "D — Full Qur'an", juz: { start: 1, end: 30 }, questionCount: 3 },
];

/** Integer Juz only: `juzToPageMap` also carries the fractional 2.5 entry,
 * which overlaps Juz 3 and would make page→Juz lookup ambiguous. The integer
 * entries are contiguous and non-overlapping from page 3 to page 596. */
const INTEGER_JUZ = Object.entries(juzToPageMap)
  .map(([juz, range]) => ({ juz: Number(juz), ...range }))
  .filter((entry) => Number.isInteger(entry.juz))
  .sort((a, b) => a.juz - b.juz);

function pagesForJuzSpan(start: number, end: number): {
  startPage: number;
  endPage: number;
} {
  const first = INTEGER_JUZ.find((entry) => entry.juz === start);
  const last = INTEGER_JUZ.find((entry) => entry.juz === end);
  if (!first || !last) {
    throw new Error(`No page range for Juz span ${start}-${end}`);
  }
  return { startPage: first.start, endPage: last.end };
}

function juzForPage(page: number): number {
  const entry = INTEGER_JUZ.find((e) => page >= e.start && page <= e.end);
  if (!entry) throw new Error(`Page ${page} is outside the Juz map`);
  return entry.juz;
}

/**
 * Splits a page span into `count` consecutive slots: the first `count - 1`
 * slots take `floor(total / count)` pages each and the last slot takes the
 * remainder. This is the rule that reproduces every published category split
 * in docs/migrations/phase-1-evaluation-model.md exactly (A1, A2, C1, D1, M1
 * are all pinned in the test), so it is the event's authoring rule rather
 * than one of several defensible roundings.
 */
export function splitIntoSlots(
  startPage: number,
  endPage: number,
  count: number
): CategoryQuestionSlot[] {
  const totalPages = endPage - startPage + 1;
  const perSlot = Math.floor(totalPages / count);
  const slots: CategoryQuestionSlot[] = [];

  let cursor = startPage;
  for (let index = 0; index < count; index++) {
    const isLast = index === count - 1;
    const slotEnd = isLast ? endPage : cursor + perSlot - 1;
    slots.push({
      questionNumber: index + 1,
      pageRange: { startPage: cursor, endPage: slotEnd },
      // Display/provenance only — pageRange stays authoritative. Derived from
      // the pages the slot actually covers, so the big screen's min/max across
      // slots reproduces the category's declared Juz span.
      sourceJuzRange: { start: juzForPage(cursor), end: juzForPage(slotEnd) },
    });
    cursor = slotEnd + 1;
  }

  return slots;
}

function buildCategory(spec: CategorySpec, order: number): EventCategoryDefinition {
  const { startPage, endPage } = pagesForJuzSpan(spec.juz.start, spec.juz.end);
  return {
    id: spec.id,
    label: { default: spec.label },
    order,
    questionCount: spec.questionCount,
    questionSlots: splitIntoSlots(startPage, endPage, spec.questionCount),
    // assetRef is deliberately unset. The category art in src/assets/categories
    // was drawn for the LISBON scheme, where the same letters mean different
    // Juz spans — Lisbon's A2 card reads "5 AJZA (26-30)", but A2 here is a
    // single Juz (Alif Lam Mim). Pointing at those files would print a wrong
    // range on the audience big screen; an absent assetRef just renders
    // nothing. Set this once artwork exists for THIS scheme.
  };
}

const categories: Record<string, EventCategoryDefinition> = Object.fromEntries(
  CATEGORY_SPECS.map((spec, index) => [spec.id, buildCategory(spec, index + 1)])
);

export const AHLUL_QURAN_MOZAMBIQUE_CATEGORY_IDS: readonly string[] =
  CATEGORY_SPECS.map((spec) => spec.id);

// ---------------------------------------------------------------------------
// Question types (Lisbon rubric, Tajweed reduced to minor mistakes only)
// ---------------------------------------------------------------------------

const counter = (
  id: string,
  order: number,
  label: string,
  perInputWeight: number
): ScoredInputDefinition => ({
  id,
  label: { default: label },
  order,
  control: "integerCounter",
  min: 0,
  max: 10,
  step: 1,
  role: "scored",
  perInputWeight,
});

const informational = (
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

/** Labels match the strings already shipped in the app's EN translations
 * (`jury.categories.*`), so jurors see the wording they are used to. The jury
 * UI renders `label.default` from the config rather than an i18n key, so these
 * strings are what actually appear on screen. */
const questionTypes: Record<string, QuestionTypeDefinition> = {
  hifdh: {
    id: "hifdh",
    label: { default: "Memorisation (الحفظ)" },
    order: 1,
    operation: "subtract",
    perSectionDeductionCap: 50,
    inputCount: 3,
    inputs: [
      counter("judge_correction", 1, "Judge correction (فتح)", 3),
      counter("self_correction", 2, "Self correction (تنبيه)", 2),
      informational("stuck", 3, "Times stuck"),
    ],
  },
  tajweed: {
    id: "tajweed",
    label: { default: "Qur'anic rules (التجويد)" },
    order: 2,
    operation: "subtract",
    perSectionDeductionCap: 30,
    inputCount: 1,
    inputs: [counter("minor", 1, "Minor mistake (اللحن الخفي)", 1)],
  },
  waqf: {
    id: "waqf",
    label: { default: "Stopping and starting (الوقف و الإبتداء)" },
    order: 3,
    operation: "subtract",
    perSectionDeductionCap: 10,
    inputCount: 2,
    inputs: [
      counter("waqf_ibtida_incorrect", 1, "Incorrect pause/start", 0.3),
      counter("waqf_ibtida_meaning", 2, "Alters meaning", 0.7),
    ],
  },
  husn_al_ada: {
    id: "husn_al_ada",
    label: { default: "Husn al-Adā' (Performance)" },
    order: 4,
    operation: "subtract",
    perSectionDeductionCap: 10,
    inputCount: 1,
    inputs: [counter("mistakes", 1, "Fluency/Performance Mistakes", 1)],
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
    label: { default: "Bonus marks (الدرجات الإضافية)" },
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

const scoringSection = {
  baseScorePerQuestion: 100,
  // Every question type subtracts, so a question can never exceed the base.
  questionBounds: { min: 0, max: 100 },
  // Headroom above questionBounds.max for the additive overall bonus (cap 5).
  finalBounds: { min: 0, max: 105 },
  missingQuestionPolicy: "incompleteEvaluation" as const,
  outputDecimals: 2 as const,
  rounding: "ecmascript-math-round" as const,
};

/**
 * Builds the event's config, computing `scoringFingerprint` and `contentHash`
 * from the same canonical fields a reader reconstructs. `provisionedAt` is the
 * caller's choice (fixed in tests, wall clock when provisioning) since it is
 * excluded from both hashes.
 */
export async function buildAhlulQuranMozambiqueConfig(
  provisionedAt: Timestamp
): Promise<EventEvaluationConfigV2> {
  const scoringFingerprint = await computeScoringFingerprint({
    scoring: scoringSection,
    categories,
    questionTypes,
    overrideRules,
    participantAdjustments,
  });

  const withoutHash = {
    schemaVersion: 2 as const,
    configVersion: AHLUL_QURAN_MOZAMBIQUE_CONFIG_VERSION,
    scoringFingerprint,
    algorithmVersion: "jury-first-v2" as const,
    scoring: scoringSection,
    categories,
    questionTypes,
    overrideRules,
    participantAdjustments,
  };

  const contentHash = await computeConfigContentHash(withoutHash);

  return { ...withoutHash, contentHash, provisionedAt };
}
