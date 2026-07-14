import { round2, clamp } from "./scoringEngine";

/**
 * Exact `legacy-lisbon-display-v1` reproduction, per
 * docs/migrations/phase-1-evaluation-model.md section 2 ("Exact
 * legacy-lisbon-display-v1"). Reproduces the ACTIVE participants/ranking
 * path (`useParticipants` + `calculateAverageScores` +
 * `fillMissingQuestionsAndCalculateAverage` + the current question scorer +
 * the ranking-eligibility sentinel + the additive bonus), not
 * `calculateJuryAverageScore`. This module is intentionally
 * Firestore/React-free: it is pure so it can be exercised directly by unit
 * tests and by an offline audit tool without importing either.
 */

export const LISBON_QUESTION_FIELDS = [
  "hifdh_judge_correction",
  "hifdh_self_correction",
  "hifdh_stuck_count",
  "tajweed_major",
  "tajweed_minor",
  "waqf_ibtida_incorrect",
  "waqf_ibtida_meaning",
  "husn_al_ada_score",
] as const;

export type LisbonQuestionFieldName = (typeof LISBON_QUESTION_FIELDS)[number];
export type LisbonQuestionFields = Record<LisbonQuestionFieldName, number>;

const zeroFields = (): LisbonQuestionFields => ({
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0,
  tajweed_major: 0,
  tajweed_minor: 0,
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  husn_al_ada_score: 0,
});

/** A single legacy `scores/*` document, as read from Firestore. `scores` is
 * loosely typed because a preserved source may carry unknown/ninth fields
 * (e.g. the embedded `overall_bonus` anomaly) that must round-trip in the
 * shadow but never enter the eight-field base calculation. */
export interface LisbonScoreSource {
  sourcePath: string;
  juryId: string;
  questionNumber: number;
  pageNumber?: number;
  scores: Record<string, unknown> | undefined | null;
}

export interface LisbonBonusSource {
  juryId: string;
  overallBonus: number;
}

export interface LisbonParticipantInput {
  participantId: string;
  isDone: boolean;
  assignedQuestions: readonly number[];
  /** Lisbon config `questionCount` for the participant's explicit leaf
   * category. Never derived by falling back to category "A". */
  expectedQuestions: number;
}

export interface LisbonQuestionDiagnostic {
  questionNumber: number;
  fields: LisbonQuestionFields;
  isVoid: boolean;
  score: number;
}

export interface LisbonDuplicateEffectiveKey {
  juryId: string;
  effectiveQuestionNumber: number;
  sourcePaths: readonly string[];
}

/** Multiple bonus sources sharing one logical `(participantId, juryId)` key
 * — per docs/migrations/phase-1-evaluation-model.md section 2 ("Preserved
 * and scoring sets"), a mandatory cutover blocker, adjudicable only by a
 * typed human decision. `overallBonuses` in encounter order, so the caller
 * can see exactly what `bonusApplied` used (last-wins, matching legacy
 * `useParticipants` snapshot-overwrite semantics) alongside the raised
 * blocker. */
export interface LisbonDuplicateBonusKey {
  juryId: string;
  overallBonuses: readonly number[];
}

export interface LisbonDisplayResult {
  participantId: string;
  /** Distinct jury IDs derived only from score documents, in first-seen
   * (document-path) order — this is also the bonus jury set. */
  scoreDerivedJuryIds: readonly string[];
  staleSourcePaths: readonly string[];
  duplicateEffectiveKeys: readonly LisbonDuplicateEffectiveKey[];
  /** Mandatory cutover blocker: two or more bonus sources for the same
   * (participantId, juryId). Never empty when `bonusApplied` reflects a
   * last-wins resolution rather than an unambiguous single value. */
  duplicateBonusKeys: readonly LisbonDuplicateBonusKey[];
  averagingBranch: "complete" | "incomplete";
  questions: readonly LisbonQuestionDiagnostic[];
  /** Always computed, even for an ineligible participant — diagnostic only
   * in that case. */
  oldDisplayedBase: number;
  bonusApplied: number;
  /** `round2(clamp(oldDisplayedBase + bonusApplied, 0, 105))` — diagnostic
   * for an ineligible participant, displayed for an eligible one. */
  newDisplayedDiagnostic: number;
  rankingEligible: boolean;
  /** The value the live app actually shows: `newDisplayedDiagnostic` when
   * eligible, exactly `-1` (never displayed/ranked) otherwise. */
  finalScore: number;
}

/** Mirrors `calculateAverageScores` (src/hooks/useParticipantScores.ts):
 * ordinary floating-point division, no rounding. */
function averageAcrossJuries(
  byJury: ReadonlyMap<string, Map<number, LisbonQuestionFields>>
): Map<number, LisbonQuestionFields> {
  const questionNumbers = new Set<number>();
  for (const juryQuestions of byJury.values()) {
    for (const questionNumber of juryQuestions.keys()) {
      questionNumbers.add(questionNumber);
    }
  }

  const result = new Map<number, LisbonQuestionFields>();
  for (const questionNumber of questionNumbers) {
    const sum = zeroFields();
    let juryCount = 0;
    for (const juryQuestions of byJury.values()) {
      const fields = juryQuestions.get(questionNumber);
      if (!fields) continue;
      juryCount += 1;
      for (const field of LISBON_QUESTION_FIELDS) {
        sum[field] += fields[field];
      }
    }
    if (juryCount === 0) continue;
    const avg = zeroFields();
    for (const field of LISBON_QUESTION_FIELDS) {
      avg[field] = sum[field] / juryCount;
    }
    result.set(questionNumber, avg);
  }
  return result;
}

/** Mirrors the current four-section question scorer
 * (src/utils/scoreUtils.ts): judge-correction void threshold, four capped
 * section deductions, clamp to a minimum of 0. */
function scoreLegacyQuestion(fields: LisbonQuestionFields): {
  score: number;
  isVoid: boolean;
} {
  if (fields.hifdh_judge_correction >= 3) {
    return { score: 0, isVoid: true };
  }
  const hifdhDeduction = Math.min(
    50,
    fields.hifdh_judge_correction * 3 + fields.hifdh_self_correction * 2
  );
  const tajweedDeduction = Math.min(
    30,
    fields.tajweed_major * 2 + fields.tajweed_minor * 1
  );
  const waqfDeduction = Math.min(
    10,
    fields.waqf_ibtida_incorrect * 0.3 + fields.waqf_ibtida_meaning * 0.7
  );
  const husnDeduction = Math.min(10, fields.husn_al_ada_score * 1);

  const score = Math.max(
    0,
    100 - hifdhDeduction - tajweedDeduction - waqfDeduction - husnDeduction
  );
  return { score, isVoid: false };
}

/**
 * Computes the exact `legacy-lisbon-display-v1` result for one participant.
 * Applies the ranking-eligibility guard (`isDone && juryIds.length > 0`)
 * before any question scoring, bonus calculation, or rank assignment — but
 * still returns the diagnostic base/bonus/delta for an ineligible
 * participant, matching the offline audit's "diagnostic only" continuation.
 */
export function computeLisbonDisplayResult(
  participant: LisbonParticipantInput,
  scoreSources: readonly LisbonScoreSource[],
  bonusSources: readonly LisbonBonusSource[]
): LisbonDisplayResult {
  const orderedSources = scoreSources
    .slice()
    .sort((a, b) => (a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0));

  const juryIds: string[] = [];
  const seenJuryIds = new Set<string>();
  const byJury = new Map<string, Map<number, LisbonQuestionFields>>();
  const staleSourcePaths: string[] = [];
  const keyOwners = new Map<string, string[]>();

  for (const source of orderedSources) {
    if (!source.scores || typeof source.scores !== "object") continue;

    if (!seenJuryIds.has(source.juryId)) {
      seenJuryIds.add(source.juryId);
      juryIds.push(source.juryId);
      byJury.set(source.juryId, new Map());
    }

    const actualPage =
      source.pageNumber !== undefined ? source.pageNumber : source.questionNumber;
    const effectiveIndex = participant.assignedQuestions.indexOf(actualPage);

    if (effectiveIndex === -1) {
      staleSourcePaths.push(source.sourcePath);
      continue;
    }
    const effectiveQuestionNumber = effectiveIndex + 1;

    const juryQuestions = byJury.get(source.juryId)!;
    const target = juryQuestions.get(effectiveQuestionNumber) ?? zeroFields();
    for (const field of LISBON_QUESTION_FIELDS) {
      const raw = source.scores[field];
      if (typeof raw === "number") {
        target[field] = raw;
      }
    }
    juryQuestions.set(effectiveQuestionNumber, target);

    const key = `${source.juryId}::${effectiveQuestionNumber}`;
    const owners = keyOwners.get(key) ?? [];
    owners.push(source.sourcePath);
    keyOwners.set(key, owners);
  }

  const duplicateEffectiveKeys: LisbonDuplicateEffectiveKey[] = [];
  for (const [key, sourcePaths] of keyOwners) {
    if (sourcePaths.length > 1) {
      const [juryId, effectiveQuestionNumberStr] = key.split("::");
      duplicateEffectiveKeys.push({
        juryId,
        effectiveQuestionNumber: Number(effectiveQuestionNumberStr),
        sourcePaths,
      });
    }
  }

  const rankingEligible = participant.isDone && juryIds.length > 0;

  const initialAverage = averageAcrossJuries(byJury);
  const existingQuestionCount = initialAverage.size;
  const expectedQuestions = participant.expectedQuestions;

  let averagingBranch: "complete" | "incomplete";
  const finalFields = new Map<number, LisbonQuestionFields>();

  if (existingQuestionCount >= expectedQuestions) {
    averagingBranch = "complete";
    for (const [questionNumber, fields] of initialAverage) {
      finalFields.set(questionNumber, fields);
    }
    for (let q = 1; q <= expectedQuestions; q++) {
      if (!finalFields.has(q)) finalFields.set(q, zeroFields());
    }
  } else {
    averagingBranch = "incomplete";
    // Fill every expected slot for every jury with a perfect (all-zero
    // deduction) score, then recompute per-field averages with Math.round.
    for (let q = 1; q <= expectedQuestions; q++) {
      const sum = zeroFields();
      for (const juryId of juryIds) {
        const juryQuestions = byJury.get(juryId)!;
        const fields = juryQuestions.get(q) ?? zeroFields();
        for (const field of LISBON_QUESTION_FIELDS) {
          sum[field] += fields[field];
        }
      }
      const rounded = zeroFields();
      const juryCount = juryIds.length || 1;
      for (const field of LISBON_QUESTION_FIELDS) {
        rounded[field] = Math.round(sum[field] / juryCount);
      }
      finalFields.set(q, rounded);
    }
  }

  const questions: LisbonQuestionDiagnostic[] = [];
  if (averagingBranch === "complete") {
    // Legacy preserves every question key present in the initial average —
    // `fillMissingQuestionsWithPerfectScores` does `{...questionScores}`
    // (src/lib/quranUtils.ts) — and `calculateScoreLogic`'s denominator is
    // `Object.values(allScores).length` (src/utils/scoreUtils.ts): every
    // key, not just the expected `1..expectedQuestions` range. An
    // anomalous extra question key must still be scored and counted, or
    // the denominator here would silently diverge from the legacy display.
    const sortedQuestionNumbers = Array.from(finalFields.keys()).sort((a, b) => a - b);
    for (const q of sortedQuestionNumbers) {
      const fields = finalFields.get(q)!;
      const { score, isVoid } = scoreLegacyQuestion(fields);
      questions.push({ questionNumber: q, fields, isVoid, score });
    }
  } else {
    // The incomplete branch legitimately discards extra keys: legacy
    // `fillMissingQuestionsAndCalculateAverage` rebuilds `averageScores`
    // from scratch only for `questionNum` in `1..expectedQuestions`.
    for (let q = 1; q <= expectedQuestions; q++) {
      const fields = finalFields.get(q) ?? zeroFields();
      const { score, isVoid } = scoreLegacyQuestion(fields);
      questions.push({ questionNumber: q, fields, isVoid, score });
    }
  }

  const meanQuestionScore =
    questions.length > 0
      ? questions.reduce((sum, q) => sum + q.score, 0) / questions.length
      : 0;
  const oldDisplayedBase = round2(clamp(meanQuestionScore, 0, 100));

  // Legacy `useParticipants` builds a per-jury bonus map by iterating
  // `overallBonuses` snapshot docs and assigning into the same map key —
  // later documents overwrite earlier ones ("last wins"), never
  // first-match. Also detect (but do not silently resolve) multiple bonus
  // sources sharing one (participantId, juryId) key: a mandatory cutover
  // blocker per design section 2.
  const bonusByJury = new Map<string, number>();
  const bonusSourceCountsByJury = new Map<string, number>();
  for (const source of bonusSources) {
    bonusSourceCountsByJury.set(
      source.juryId,
      (bonusSourceCountsByJury.get(source.juryId) ?? 0) + 1
    );
    bonusByJury.set(source.juryId, source.overallBonus);
  }

  const duplicateBonusKeys: LisbonDuplicateBonusKey[] = [];
  for (const [juryId, count] of bonusSourceCountsByJury) {
    if (count > 1) {
      duplicateBonusKeys.push({
        juryId,
        overallBonuses: bonusSources
          .filter((b) => b.juryId === juryId)
          .map((b) => b.overallBonus),
      });
    }
  }

  const bonusApplied =
    juryIds.length > 0
      ? juryIds.reduce((sum, juryId) => sum + (bonusByJury.get(juryId) ?? 0), 0) /
        juryIds.length
      : 0;

  const newDisplayedDiagnostic = round2(clamp(oldDisplayedBase + bonusApplied, 0, 105));

  return {
    participantId: participant.participantId,
    scoreDerivedJuryIds: juryIds,
    staleSourcePaths,
    duplicateEffectiveKeys,
    duplicateBonusKeys,
    averagingBranch,
    questions,
    oldDisplayedBase,
    bonusApplied,
    newDisplayedDiagnostic,
    rankingEligible,
    finalScore: rankingEligible ? newDisplayedDiagnostic : -1,
  };
}
