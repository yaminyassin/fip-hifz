import type {
  AdjustmentTypeId,
  EventEvaluationConfigV2,
  InputId,
  ParticipantAdjustmentDefinition,
  QuestionOverrideRule,
  QuestionTypeDefinition,
  QuestionTypeId,
} from "./types";

/**
 * Deterministic `jury-first-v2` scorer, per
 * docs/migrations/phase-1-evaluation-model.md section 2 ("Deterministic V2
 * scorer"). All arithmetic uses IEEE-754 binary64 in the operation order
 * specified there: sections/inputs by ascending `order`, questions by
 * ascending `questionNumber`, juries by ascending `juryId`.
 */

export type QuestionValueMap = Readonly<
  Record<QuestionTypeId, Readonly<Record<InputId, number>>>
>;
export type AdjustmentValueMap = Readonly<
  Record<AdjustmentTypeId, Readonly<Record<InputId, number>>>
>;

export interface QuestionScoreResult {
  score: number;
  terminalRuleId: string | null;
  sectionImpacts: Readonly<Record<QuestionTypeId, number>>;
}

export type EngineResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/** `round2` is exactly `Math.round(value * 100) / 100`. A non-JavaScript
 * audit implementation must reproduce ECMAScript `Math.round`'s tie
 * direction rather than the host language's default rounding. */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const STEP_TOLERANCE = 1e-9;

function orderedSectionIds(
  config: EventEvaluationConfigV2
): QuestionTypeId[] {
  return Object.values(config.questionTypes)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => section.id);
}

function sectionCap(section: QuestionTypeDefinition): number {
  return section.operation === "subtract"
    ? section.perSectionDeductionCap
    : section.perSectionAdditionCap;
}

function adjustmentCap(adjustment: ParticipantAdjustmentDefinition): number {
  return adjustment.operation === "subtract"
    ? adjustment.deductionCap
    : adjustment.additionCap;
}

/**
 * Validates a stored question value map against the config's section/input
 * definitions: every value is finite, every section/input is known, every
 * required input is present exactly once, `min <= value <= max`, and the
 * value is step-aligned within a 1e-9 tolerance. Informational values are
 * validated but never affect impact.
 */
export function validateQuestionValues(
  config: EventEvaluationConfigV2,
  values: QuestionValueMap
): EngineResult<true> {
  const errors: string[] = [];
  const sections = config.questionTypes;

  const knownSectionIds = new Set(Object.values(sections).map((s) => s.id));
  for (const sectionId of Object.keys(values)) {
    if (!knownSectionIds.has(sectionId)) {
      errors.push(`unknown section "${sectionId}" in stored values`);
    }
  }

  for (const section of Object.values(sections)) {
    const sectionValues = values[section.id];
    if (!sectionValues) {
      errors.push(`missing section "${section.id}" in stored values`);
      continue;
    }
    const expectedInputIds = new Set(section.inputs.map((i) => i.id));
    const presentInputIds = Object.keys(sectionValues);
    for (const inputId of presentInputIds) {
      if (!expectedInputIds.has(inputId)) {
        errors.push(
          `unknown input "${section.id}.${inputId}" in stored values`
        );
      }
    }
    for (const inputDef of section.inputs) {
      if (!(inputDef.id in sectionValues)) {
        errors.push(`missing required input "${section.id}.${inputDef.id}"`);
        continue;
      }
      const value = sectionValues[inputDef.id];
      if (!Number.isFinite(value)) {
        errors.push(`"${section.id}.${inputDef.id}" must be finite`);
        continue;
      }
      if (value < inputDef.min || value > inputDef.max) {
        errors.push(
          `"${section.id}.${inputDef.id}" (${value}) is outside [${inputDef.min}, ${inputDef.max}]`
        );
        continue;
      }
      const steps = (value - inputDef.min) / inputDef.step;
      if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) {
        errors.push(
          `"${section.id}.${inputDef.id}" (${value}) is not step-aligned`
        );
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: true };
}

export function validateAdjustmentValues(
  config: EventEvaluationConfigV2,
  values: AdjustmentValueMap
): EngineResult<true> {
  const errors: string[] = [];
  const adjustments = config.participantAdjustments;

  const knownAdjustmentIds = new Set(
    Object.values(adjustments).map((a) => a.id)
  );
  for (const adjustmentId of Object.keys(values)) {
    if (!knownAdjustmentIds.has(adjustmentId)) {
      errors.push(`unknown adjustment "${adjustmentId}" in stored values`);
    }
  }

  for (const adjustment of Object.values(adjustments)) {
    const adjustmentValues = values[adjustment.id];
    if (!adjustmentValues) {
      errors.push(`missing adjustment "${adjustment.id}" in stored values`);
      continue;
    }
    const expectedInputIds = new Set(adjustment.inputs.map((i) => i.id));
    for (const inputId of Object.keys(adjustmentValues)) {
      if (!expectedInputIds.has(inputId)) {
        errors.push(
          `unknown input "${adjustment.id}.${inputId}" in stored values`
        );
      }
    }
    for (const inputDef of adjustment.inputs) {
      if (!(inputDef.id in adjustmentValues)) {
        errors.push(
          `missing required input "${adjustment.id}.${inputDef.id}"`
        );
        continue;
      }
      const value = adjustmentValues[inputDef.id];
      if (!Number.isFinite(value)) {
        errors.push(`"${adjustment.id}.${inputDef.id}" must be finite`);
        continue;
      }
      if (value < inputDef.min || value > inputDef.max) {
        errors.push(
          `"${adjustment.id}.${inputDef.id}" (${value}) is outside [${inputDef.min}, ${inputDef.max}]`
        );
        continue;
      }
      const steps = (value - inputDef.min) / inputDef.step;
      if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) {
        errors.push(
          `"${adjustment.id}.${inputDef.id}" (${value}) is not step-aligned`
        );
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: true };
}

function evaluateCondition(
  config: EventEvaluationConfigV2,
  condition: QuestionOverrideRule["when"]["conditions"][number],
  values: QuestionValueMap
): boolean {
  const raw = values[condition.input.questionTypeId]?.[condition.input.inputId];
  if (raw === undefined || !Number.isFinite(raw)) return false;
  switch (condition.operator) {
    case "gte":
      return raw >= condition.value;
    case "gt":
      return raw > condition.value;
    case "eq":
      return raw === condition.value;
    case "lte":
      return raw <= condition.value;
    case "lt":
      return raw < condition.value;
  }
  // Exhaustiveness guard; config validation already rejects unknown operators.
  void config;
  return false;
}

function ruleMatches(
  config: EventEvaluationConfigV2,
  rule: QuestionOverrideRule,
  values: QuestionValueMap
): boolean {
  const evaluations = rule.when.conditions.map((c) =>
    evaluateCondition(config, c, values)
  );
  return rule.when.kind === "all"
    ? evaluations.every(Boolean)
    : evaluations.some(Boolean);
}

/**
 * Scores a single question. Impact is always clamped to `[0, cap]` as a
 * defensive scoring invariant: a negative, infinite, or NaN stored value
 * therefore cannot add points, even though `validateQuestionValues` should
 * already have rejected it upstream.
 */
export function scoreQuestion(
  config: EventEvaluationConfigV2,
  values: QuestionValueMap
): EngineResult<QuestionScoreResult> {
  const validation = validateQuestionValues(config, values);
  if (!validation.ok) return validation;

  const sectionIds = orderedSectionIds(config);
  const sections = config.questionTypes;

  const normalImpact = new Map<QuestionTypeId, number>();
  for (const sectionId of sectionIds) {
    const section = sections[sectionId];
    const orderedInputs = section.inputs
      .slice()
      .sort((a, b) => a.order - b.order);
    let rawImpact = 0;
    for (const inputDef of orderedInputs) {
      if (inputDef.role !== "scored") continue;
      const value = values[sectionId]?.[inputDef.id] ?? 0;
      rawImpact += value * inputDef.perInputWeight;
    }
    normalImpact.set(sectionId, clamp(rawImpact, 0, sectionCap(section)));
  }

  const zeroSectionImpacts = (): Record<QuestionTypeId, number> => {
    const zeros: Record<QuestionTypeId, number> = {};
    for (const sectionId of sectionIds) zeros[sectionId] = 0;
    return zeros;
  };

  const sectionOverride = new Map<QuestionTypeId, number>();
  const orderedRules = config.overrideRules
    .slice()
    .sort((a, b) => a.priority - b.priority);

  for (const rule of orderedRules) {
    if (!ruleMatches(config, rule, values)) continue;

    if (rule.action.kind === "setSectionImpact") {
      const targetId = rule.action.questionTypeId;
      if (!sectionOverride.has(targetId)) {
        const targetSection = sections[targetId];
        sectionOverride.set(
          targetId,
          clamp(rule.action.impact, 0, sectionCap(targetSection))
        );
      }
      continue;
    }

    if (rule.action.kind === "voidQuestion") {
      return {
        ok: true,
        value: {
          score: 0,
          terminalRuleId: rule.id,
          sectionImpacts: zeroSectionImpacts(),
        },
      };
    }

    // setQuestionScore
    return {
      ok: true,
      value: {
        score: rule.action.score,
        terminalRuleId: rule.id,
        sectionImpacts: zeroSectionImpacts(),
      },
    };
  }

  let signedTotal = 0;
  const sectionImpacts: Record<QuestionTypeId, number> = {};
  for (const sectionId of sectionIds) {
    const section = sections[sectionId];
    const impact = sectionOverride.get(sectionId) ?? normalImpact.get(sectionId)!;
    sectionImpacts[sectionId] = impact;
    signedTotal += section.operation === "subtract" ? -impact : impact;
  }

  const score = clamp(
    config.scoring.baseScorePerQuestion + signedTotal,
    config.scoring.questionBounds.min,
    config.scoring.questionBounds.max
  );

  return {
    ok: true,
    value: { score, terminalRuleId: null, sectionImpacts },
  };
}

export interface JuryScoreResult {
  juryBase: number;
  signedAdjustmentTotal: number;
  juryFinal: number;
  questionResults: readonly QuestionScoreResult[];
}

/**
 * Scores one jury's complete evaluation of a participant. `questionValues`
 * must contain exactly one entry for every assigned question number
 * (`incompleteEvaluation` policy: a missing, duplicate, stale, invalid, or
 * provenance-mismatched question prevents a final score).
 */
export function scoreJury(
  config: EventEvaluationConfigV2,
  assignedQuestionNumbers: readonly number[],
  questionValues: ReadonlyMap<number, QuestionValueMap>,
  adjustmentValues: AdjustmentValueMap
): EngineResult<JuryScoreResult> {
  const errors: string[] = [];
  const orderedQuestionNumbers = assignedQuestionNumbers.slice().sort((a, b) => a - b);

  if (orderedQuestionNumbers.length === 0) {
    return {
      ok: false,
      errors: ["incomplete evaluation: no assigned questions to score"],
    };
  }

  // The contract is exactly one score per assigned question. A duplicate in
  // the assignment list would otherwise score that question twice (and let an
  // unrelated map entry satisfy the size check below), silently skewing the
  // average. Enforce uniqueness rather than trust callers.
  if (new Set(orderedQuestionNumbers).size !== orderedQuestionNumbers.length) {
    return {
      ok: false,
      errors: ["incomplete evaluation: assigned question numbers contain duplicates"],
    };
  }

  if (questionValues.size !== orderedQuestionNumbers.length) {
    errors.push(
      `expected exactly ${orderedQuestionNumbers.length} scored questions, got ${questionValues.size}`
    );
  }

  const questionResults: QuestionScoreResult[] = [];
  for (const questionNumber of orderedQuestionNumbers) {
    const values = questionValues.get(questionNumber);
    if (!values) {
      errors.push(`missing score for assigned question ${questionNumber}`);
      continue;
    }
    const result = scoreQuestion(config, values);
    if (!result.ok) {
      errors.push(...result.errors.map((e) => `question ${questionNumber}: ${e}`));
      continue;
    }
    questionResults.push(result.value);
  }

  if (errors.length > 0) return { ok: false, errors };

  const juryBase =
    questionResults.reduce((sum, r) => sum + r.score, 0) / questionResults.length;

  const adjustmentValidation = validateAdjustmentValues(config, adjustmentValues);
  if (!adjustmentValidation.ok) return adjustmentValidation;

  const orderedAdjustments = Object.values(config.participantAdjustments)
    .slice()
    .sort((a, b) => a.order - b.order);

  let signedAdjustmentTotal = 0;
  for (const adjustment of orderedAdjustments) {
    const orderedInputs = adjustment.inputs
      .slice()
      .sort((a, b) => a.order - b.order);
    let rawImpact = 0;
    for (const inputDef of orderedInputs) {
      if (inputDef.role !== "scored") continue;
      const value = adjustmentValues[adjustment.id]?.[inputDef.id] ?? 0;
      rawImpact += value * inputDef.perInputWeight;
    }
    const impact = clamp(rawImpact, 0, adjustmentCap(adjustment));
    signedAdjustmentTotal +=
      adjustment.operation === "subtract" ? -impact : impact;
  }

  const juryFinal = clamp(
    juryBase + signedAdjustmentTotal,
    config.scoring.finalBounds.min,
    config.scoring.finalBounds.max
  );

  return {
    ok: true,
    value: { juryBase, signedAdjustmentTotal, juryFinal, questionResults },
  };
}

/**
 * Aggregates jury-level finals into the participant-level result, sorted by
 * `juryId` for determinism (record insertion order is never authoritative).
 */
export function scoreParticipant(
  juryResultsByJuryId: ReadonlyMap<string, JuryScoreResult>
): EngineResult<number> {
  if (juryResultsByJuryId.size === 0) {
    return { ok: false, errors: ["no jury results to aggregate"] };
  }
  const sortedJuryIds = Array.from(juryResultsByJuryId.keys()).sort();
  let sum = 0;
  for (const juryId of sortedJuryIds) {
    const juryFinal = juryResultsByJuryId.get(juryId)!.juryFinal;
    // A well-formed JuryScoreResult from scoreJury is always finite, but this
    // is the aggregation boundary: never emit a NaN/Infinity participant score
    // if a caller hands in a malformed jury result.
    if (!Number.isFinite(juryFinal)) {
      return { ok: false, errors: [`non-finite jury final for jury "${juryId}"`] };
    }
    sum += juryFinal;
  }
  const value = round2(sum / sortedJuryIds.length);
  if (!Number.isFinite(value)) {
    return { ok: false, errors: ["non-finite aggregate participant score"] };
  }
  return { ok: true, value };
}
