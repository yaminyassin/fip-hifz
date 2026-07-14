import { scoreQuestion, type AdjustmentValueMap, type QuestionValueMap } from "./scoringEngine";
import { canonicalStringify, sha256Hex } from "./configHash";
import type { CategoryQuestionSlot, EventEvaluationConfigV2 } from "./types";

/**
 * Pure, config-driven helpers shared by every consumer that renders or
 * writes evaluation input state (jury form, hooks, seed/provisioning
 * scripts). These build on top of the committed engine
 * (src/evaluation/scoringEngine.ts) without reimplementing any scoring
 * logic — they only compute defaults and a display-only "would this void
 * the question" check.
 */

/** All-zero (well, all-`min`) question values for every section/input in
 * the config, ordered by nothing in particular (callers order by `order`
 * when rendering). Used to seed a jury's in-progress form state and as the
 * baseline merged with any stored values. */
export function buildDefaultQuestionValues(
  config: EventEvaluationConfigV2
): QuestionValueMap {
  const sections: Record<string, Record<string, number>> = {};
  for (const section of Object.values(config.questionTypes)) {
    const inputs: Record<string, number> = {};
    for (const input of section.inputs) {
      inputs[input.id] = input.min;
    }
    sections[section.id] = inputs;
  }
  return sections;
}

/** All-`min` participant adjustment values (e.g. the overall bonus slider
 * defaults to 0) for every adjustment/input in the config. */
export function buildDefaultAdjustmentValues(
  config: EventEvaluationConfigV2
): AdjustmentValueMap {
  const adjustments: Record<string, Record<string, number>> = {};
  for (const adjustment of Object.values(config.participantAdjustments)) {
    const inputs: Record<string, number> = {};
    for (const input of adjustment.inputs) {
      inputs[input.id] = input.min;
    }
    adjustments[adjustment.id] = inputs;
  }
  return adjustments;
}

/** Merges partial stored values (which may be missing sections/inputs
 * added to the config after the value was last saved) onto the config's
 * defaults, so the form always has a value for every current input. */
export function mergeQuestionValues(
  config: EventEvaluationConfigV2,
  stored: QuestionValueMap | undefined
): QuestionValueMap {
  const defaults = buildDefaultQuestionValues(config);
  if (!stored) return defaults;
  const merged: Record<string, Record<string, number>> = {};
  for (const sectionId of Object.keys(defaults)) {
    merged[sectionId] = { ...defaults[sectionId], ...stored[sectionId] };
  }
  return merged;
}

export function mergeAdjustmentValues(
  config: EventEvaluationConfigV2,
  stored: AdjustmentValueMap | undefined
): AdjustmentValueMap {
  const defaults = buildDefaultAdjustmentValues(config);
  if (!stored) return defaults;
  const merged: Record<string, Record<string, number>> = {};
  for (const adjustmentId of Object.keys(defaults)) {
    merged[adjustmentId] = { ...defaults[adjustmentId], ...stored[adjustmentId] };
  }
  return merged;
}

/**
 * Whether the current in-progress question values would be voided by a
 * `voidQuestion` override rule, for a generic (non-hardcoded) "this
 * question will score zero" warning highlight in the jury form. Derived
 * entirely from `scoreQuestion`'s `terminalRuleId` plus the config's own
 * rule definitions — never a hardcoded field/threshold.
 */
export function questionWouldVoid(
  config: EventEvaluationConfigV2,
  values: QuestionValueMap
): boolean {
  const result = scoreQuestion(config, values);
  if (!result.ok || result.value.terminalRuleId === null) return false;
  return ruleIsVoid(config, result.value.terminalRuleId);
}

/** Whether a given (already-fired) override rule id is specifically a
 * `voidQuestion` rule, for display purposes (e.g. a "voided" badge on an
 * already-scored question). */
export function ruleIsVoid(
  config: EventEvaluationConfigV2,
  terminalRuleId: string | null
): boolean {
  if (terminalRuleId === null) return false;
  const rule = config.overrideRules.find((r) => r.id === terminalRuleId);
  return rule?.action.kind === "voidQuestion";
}

/** Orders a config record (categories/questionTypes/participantAdjustments)
 * by its `order` field, returning the list of `[id, definition]` pairs. */
export function orderedEntries<T extends { order: number }>(
  record: Readonly<Record<string, T>>
): Array<[string, T]> {
  return Object.entries(record).sort(([, a], [, b]) => a.order - b.order);
}

/**
 * A stable, non-cryptographic-strength provenance hash binding a stored V2
 * score/adjustment document to the exact assignment it was scored against
 * (participant, category, and assigned page numbers at write time). Not
 * currently re-verified by the engine on read (see design doc §6, "open
 * risks" — enforcement is a later phase), but stamped on every write so a
 * future reader can detect a stale score after a reassignment/reset.
 */
export async function computeAssignmentHash(
  participantId: string,
  categoryId: string,
  assignedQuestions: readonly number[]
): Promise<string> {
  return sha256Hex(
    canonicalStringify({ participantId, categoryId, assignedQuestions })
  );
}

/**
 * Picks a random page within a category question slot's authoritative
 * `pageRange` (design doc §4, randomizer row): the range is now the single
 * source of truth, replacing `generateRandomPage`/`getCategoryConfig`/
 * `juzToPageMap` and fixing the prior Juz-overlap bug.
 *
 * Exclusion-exhaustion behavior (design doc §6, "open risks"): if every page
 * in the range has already been used (`excludedPages`), this falls back to
 * a uniform-random page anywhere in the range (reuse), logging a warning,
 * rather than throwing — a competition must still be able to proceed even
 * if a narrow range has been fully exhausted.
 */
export function pickRandomPageFromSlot(
  slot: CategoryQuestionSlot,
  excludedPages: readonly number[] = []
): number {
  const { startPage, endPage } = slot.pageRange;
  const excluded = new Set(excludedPages);

  const availablePages: number[] = [];
  for (let page = startPage; page <= endPage; page++) {
    if (!excluded.has(page)) availablePages.push(page);
  }

  if (availablePages.length === 0) {
    console.warn(
      `All pages in range ${startPage}-${endPage} are excluded; reusing a random page from the full range.`
    );
    return startPage + Math.floor(Math.random() * (endPage - startPage + 1));
  }

  return availablePages[Math.floor(Math.random() * availablePages.length)];
}
