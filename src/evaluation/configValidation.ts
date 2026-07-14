import { canonicalStringify } from "./configHash";
import type {
  EvaluationInputDefinition,
  EventCategoryDefinition,
  EventEvaluationConfigV2,
  ParticipantAdjustmentDefinition,
  QuestionOverrideRule,
  QuestionTypeDefinition,
} from "./types";

export interface ConfigValidationResult {
  ok: boolean;
  errors: string[];
  config: EventEvaluationConfigV2 | null;
}

const MAX_CONFIG_BYTES = 64 * 1024;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isFiniteInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value);

/**
 * Validates an `EventEvaluationConfigV2` against every rule in
 * docs/migrations/phase-1-evaluation-model.md section 2 ("Config
 * validation"). Accepts `unknown` because the config is untrusted input at
 * the Firestore boundary. Any failure fails closed: `ok: false`, no scorer
 * is created, no consumer mounts.
 */
export function validateEvaluationConfig(
  input: unknown
): ConfigValidationResult {
  const errors: string[] = [];
  const push = (message: string) => errors.push(message);

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["config is not an object"], config: null };
  }
  const config = input as Partial<EventEvaluationConfigV2>;

  if (config.schemaVersion !== 2) {
    push("schemaVersion must be exactly 2");
  }
  if (typeof config.configVersion !== "string" || config.configVersion === "") {
    push("configVersion must be a non-empty string");
  }
  if (
    typeof config.scoringFingerprint !== "string" ||
    config.scoringFingerprint === ""
  ) {
    push("scoringFingerprint must be a non-empty string");
  }
  if (
    config.algorithmVersion !== "legacy-lisbon-display-v1" &&
    config.algorithmVersion !== "jury-first-v2"
  ) {
    push("algorithmVersion must be a known EvaluationMode");
  }

  const scoring = config.scoring;
  if (!scoring || typeof scoring !== "object") {
    push("scoring section is required");
  } else {
    if (!isFiniteNumber(scoring.baseScorePerQuestion)) {
      push("scoring.baseScorePerQuestion must be finite");
    }
    if (
      !scoring.questionBounds ||
      !isFiniteNumber(scoring.questionBounds.min) ||
      !isFiniteNumber(scoring.questionBounds.max)
    ) {
      push("scoring.questionBounds.min/max must be finite");
    } else if (scoring.questionBounds.min > scoring.questionBounds.max) {
      push("scoring.questionBounds.min must be <= max");
    } else if (
      isFiniteNumber(scoring.baseScorePerQuestion) &&
      (scoring.baseScorePerQuestion < scoring.questionBounds.min ||
        scoring.baseScorePerQuestion > scoring.questionBounds.max)
    ) {
      push("scoring.baseScorePerQuestion must be within questionBounds");
    }
    if (
      !scoring.finalBounds ||
      !isFiniteNumber(scoring.finalBounds.min) ||
      !isFiniteNumber(scoring.finalBounds.max)
    ) {
      push("scoring.finalBounds.min/max must be finite");
    } else if (scoring.finalBounds.min > scoring.finalBounds.max) {
      push("scoring.finalBounds.min must be <= max");
    }
    if (
      scoring.missingQuestionPolicy !== "zeroInputsArePerfect" &&
      scoring.missingQuestionPolicy !== "incompleteEvaluation"
    ) {
      push("scoring.missingQuestionPolicy must be a known policy");
    }
  }

  const allOrders: { list: string; label: string; order: unknown }[] = [];
  const knownSectionIds = new Set<string>();
  const knownAdjustmentIds = new Set<string>();
  // sectionId/inputId -> input definition, for condition/action validation.
  const inputsBySection = new Map<
    string,
    Map<string, EvaluationInputDefinition>
  >();
  const capsBySection = new Map<string, number>();

  const validateInputs = (
    inputs: readonly EvaluationInputDefinition[] | undefined,
    inputCount: unknown,
    listLabel: string,
    seenIds: Set<string>,
    orderList: { list: string; label: string; order: unknown }[]
  ) => {
    if (!Array.isArray(inputs)) {
      push(`${listLabel}.inputs must be an array`);
      return;
    }
    if (inputCount !== inputs.length) {
      push(`${listLabel}.inputCount must equal inputs.length`);
    }
    for (const inputDef of inputs) {
      if (!inputDef || typeof inputDef.id !== "string" || inputDef.id === "") {
        push(`${listLabel} has an input with an empty id`);
        continue;
      }
      if (seenIds.has(inputDef.id)) {
        push(`${listLabel} has duplicate input id "${inputDef.id}"`);
      }
      seenIds.add(inputDef.id);
      orderList.push({
        list: listLabel,
        label: `${listLabel}.${inputDef.id}`,
        order: inputDef.order,
      });

      if (!isFiniteNumber(inputDef.min) || !isFiniteNumber(inputDef.max)) {
        push(`${listLabel}.${inputDef.id}: min/max must be finite`);
      } else if (!(0 <= inputDef.min && inputDef.min <= inputDef.max)) {
        push(`${listLabel}.${inputDef.id}: must satisfy 0 <= min <= max`);
      }
      if (!isFiniteNumber(inputDef.step)) {
        push(`${listLabel}.${inputDef.id}: step must be finite`);
      } else if (inputDef.step <= 0) {
        push(`${listLabel}.${inputDef.id}: step must be > 0`);
      }

      if (inputDef.role === "scored") {
        if (
          !isFiniteNumber(inputDef.perInputWeight) ||
          inputDef.perInputWeight <= 0
        ) {
          push(
            `${listLabel}.${inputDef.id}: scored input perInputWeight must be finite and > 0`
          );
        }
      } else if (inputDef.role === "informational") {
        if ("perInputWeight" in inputDef) {
          push(
            `${listLabel}.${inputDef.id}: informational input must not carry a weight`
          );
        }
      } else {
        push(`${listLabel}.${inputDef.id}: unknown input role`);
      }
    }
  };

  // --- categories ---
  const categories = config.categories;
  if (!categories || typeof categories !== "object") {
    push("categories is required");
  } else {
    const categoryOrders: unknown[] = [];
    const categoryIds = new Set<string>();
    for (const [key, category] of Object.entries(
      categories as Record<string, EventCategoryDefinition>
    )) {
      if (!category.id || category.id === "") {
        push(`category "${key}" has an empty id`);
      } else if (categoryIds.has(category.id)) {
        push(`duplicate category id "${category.id}"`);
      } else {
        categoryIds.add(category.id);
      }
      if (category.id && category.id !== key) {
        push(
          `category record key "${key}" does not match its embedded id "${category.id}"`
        );
      }
      categoryOrders.push(category.order);
      allOrders.push({
        list: "categories",
        label: `categories.${key}`,
        order: category.order,
      });

      if (!isFiniteInteger(category.questionCount) || category.questionCount < 1) {
        push(`category "${key}": questionCount must be a finite integer >= 1`);
      }
      if (
        category.assetRef !== undefined &&
        (typeof category.assetRef !== "string" || category.assetRef === "")
      ) {
        push(`category "${key}": assetRef, if present, must be a non-empty string`);
      }
      if (
        !Array.isArray(category.questionSlots) ||
        category.questionCount !== category.questionSlots.length
      ) {
        push(`category "${key}": questionCount must equal questionSlots.length`);
      } else {
        const expectedNumbers = new Set(
          Array.from({ length: category.questionCount }, (_, i) => i + 1)
        );
        const seenNumbers = new Set<number>();
        for (const slot of category.questionSlots) {
          seenNumbers.add(slot.questionNumber);
          if (
            !isFiniteInteger(slot.pageRange?.startPage) ||
            !isFiniteInteger(slot.pageRange?.endPage) ||
            !(
              1 <= slot.pageRange.startPage &&
              slot.pageRange.startPage <= slot.pageRange.endPage &&
              slot.pageRange.endPage <= 604
            )
          ) {
            push(
              `category "${key}" question ${slot.questionNumber}: pageRange must satisfy 1 <= startPage <= endPage <= 604`
            );
          }
        }
        const numbersMatch =
          seenNumbers.size === expectedNumbers.size &&
          Array.from(expectedNumbers).every((n) => seenNumbers.has(n));
        if (!numbersMatch) {
          push(
            `category "${key}": questionSlots numbers must be exactly 1..questionCount`
          );
        }
      }
    }
  }

  // --- questionTypes ---
  const questionTypes = config.questionTypes;
  if (!questionTypes || typeof questionTypes !== "object") {
    push("questionTypes is required");
  } else {
    for (const [key, questionType] of Object.entries(
      questionTypes as Record<string, QuestionTypeDefinition>
    )) {
      if (!questionType.id || questionType.id === "") {
        push(`questionType "${key}" has an empty id`);
      } else if (knownSectionIds.has(questionType.id)) {
        push(`duplicate questionType id "${questionType.id}"`);
      } else {
        knownSectionIds.add(questionType.id);
      }
      if (questionType.id && questionType.id !== key) {
        push(
          `questionType record key "${key}" does not match its embedded id "${questionType.id}"`
        );
      }
      allOrders.push({
        list: "questionTypes",
        label: `questionTypes.${key}`,
        order: questionType.order,
      });

      const cap =
        questionType.operation === "subtract"
          ? questionType.perSectionDeductionCap
          : questionType.operation === "add"
            ? questionType.perSectionAdditionCap
            : undefined;
      if (!isFiniteNumber(cap) || cap < 0) {
        push(`questionType "${key}": section cap must be finite and >= 0`);
      } else {
        capsBySection.set(questionType.id, cap);
      }

      const seenInputIds = new Set<string>();
      const inputOrders: { list: string; label: string; order: unknown }[] = [];
      validateInputs(
        questionType.inputs,
        questionType.inputCount,
        `questionTypes.${key}`,
        seenInputIds,
        inputOrders
      );
      allOrders.push(...inputOrders);

      const inputMap = new Map<string, EvaluationInputDefinition>();
      if (Array.isArray(questionType.inputs)) {
        for (const inputDef of questionType.inputs) {
          if (inputDef?.id) inputMap.set(inputDef.id, inputDef);
        }
      }
      inputsBySection.set(questionType.id, inputMap);
    }
  }

  // --- overrideRules ---
  // Required (may be an empty array, but must be present): the engine calls
  // `config.overrideRules.slice()` unconditionally in `scoreQuestion`, so an
  // absent/undefined `overrideRules` must fail validation here rather than
  // crash the scorer later.
  const overrideRules = config.overrideRules;
  if (!Array.isArray(overrideRules)) {
    push("overrideRules is required and must be an array");
  } else {
    const seenIds = new Set<string>();
    const priorities = new Map<number, string[]>();
    for (const rule of overrideRules as QuestionOverrideRule[]) {
      if (!rule.id || rule.id === "") {
        push("override rule has an empty id");
      } else if (seenIds.has(rule.id)) {
        push(`duplicate override rule id "${rule.id}"`);
      } else {
        seenIds.add(rule.id);
      }

      if (!isFiniteInteger(rule.priority)) {
        push(`override rule "${rule.id}": priority must be a finite integer`);
      } else {
        const withPriority = priorities.get(rule.priority) ?? [];
        withPriority.push(rule.id);
        priorities.set(rule.priority, withPriority);
      }

      if (
        !rule.when ||
        !Array.isArray(rule.when.conditions) ||
        rule.when.conditions.length === 0
      ) {
        push(`override rule "${rule.id}": condition list must be non-empty`);
      } else {
        if (rule.when.kind !== "all" && rule.when.kind !== "any") {
          push(
            `override rule "${rule.id}": when.kind must be "all" or "any"`
          );
        }
        for (const condition of rule.when.conditions) {
          const sectionInputs = inputsBySection.get(
            condition.input?.questionTypeId
          );
          const referencedInput = sectionInputs?.get(condition.input?.inputId);
          if (!sectionInputs || !referencedInput) {
            push(
              `override rule "${rule.id}": condition references unknown section or input`
            );
            continue;
          }
          if (
            condition.operator !== "gte" &&
            condition.operator !== "gt" &&
            condition.operator !== "eq" &&
            condition.operator !== "lte" &&
            condition.operator !== "lt"
          ) {
            push(
              `override rule "${rule.id}": condition operator "${String(condition.operator)}" is unknown`
            );
            continue;
          }
          if (
            !isFiniteNumber(condition.value) ||
            condition.value < referencedInput.min ||
            condition.value > referencedInput.max
          ) {
            push(
              `override rule "${rule.id}": condition value must be finite and within the referenced input's range`
            );
          }
        }
      }

      if (rule.action?.kind === "setSectionImpact") {
        const targetCap = capsBySection.get(rule.action.questionTypeId);
        if (targetCap === undefined) {
          push(
            `override rule "${rule.id}": setSectionImpact target is unknown`
          );
        } else if (
          !isFiniteNumber(rule.action.impact) ||
          rule.action.impact < 0 ||
          rule.action.impact > targetCap
        ) {
          push(
            `override rule "${rule.id}": setSectionImpact impact must be finite and within [0, target cap]`
          );
        }
      } else if (rule.action?.kind === "setQuestionScore") {
        const bounds = scoring?.questionBounds;
        if (
          !isFiniteNumber(rule.action.score) ||
          !bounds ||
          rule.action.score < bounds.min ||
          rule.action.score > bounds.max
        ) {
          push(
            `override rule "${rule.id}": setQuestionScore score must be finite and within questionBounds`
          );
        }
      } else if (rule.action?.kind !== "voidQuestion") {
        push(`override rule "${rule.id}": unknown action kind`);
      }
    }
    for (const [priority, ids] of priorities) {
      if (ids.length > 1) {
        push(
          `override rules share priority ${priority}: ${ids.join(", ")}`
        );
      }
    }
  }

  // --- participantAdjustments ---
  const participantAdjustments = config.participantAdjustments;
  if (!participantAdjustments || typeof participantAdjustments !== "object") {
    push("participantAdjustments is required (may be empty object)");
  } else {
    for (const [key, adjustment] of Object.entries(
      participantAdjustments as Record<string, ParticipantAdjustmentDefinition>
    )) {
      if (!adjustment.id || adjustment.id === "") {
        push(`participantAdjustment "${key}" has an empty id`);
      } else if (knownAdjustmentIds.has(adjustment.id)) {
        push(`duplicate participantAdjustment id "${adjustment.id}"`);
      } else {
        knownAdjustmentIds.add(adjustment.id);
      }
      if (adjustment.id && adjustment.id !== key) {
        push(
          `participantAdjustment record key "${key}" does not match its embedded id "${adjustment.id}"`
        );
      }
      allOrders.push({
        list: "participantAdjustments",
        label: `participantAdjustments.${key}`,
        order: adjustment.order,
      });

      const cap =
        adjustment.operation === "subtract"
          ? adjustment.deductionCap
          : adjustment.operation === "add"
            ? adjustment.additionCap
            : undefined;
      if (!isFiniteNumber(cap) || cap < 0) {
        push(
          `participantAdjustment "${key}": cap must be finite and >= 0`
        );
      }

      const seenInputIds = new Set<string>();
      const inputOrders: { list: string; label: string; order: unknown }[] = [];
      validateInputs(
        adjustment.inputs,
        adjustment.inputCount,
        `participantAdjustments.${key}`,
        seenInputIds,
        inputOrders
      );
      allOrders.push(...inputOrders);
    }
  }

  // --- order validation (finite integer, unique within its list) ---
  const orderByList = new Map<string, Map<number, string[]>>();
  for (const entry of allOrders) {
    if (!isFiniteInteger(entry.order)) {
      push(`${entry.label}: order must be a finite integer`);
      continue;
    }
    const listMap = orderByList.get(entry.list) ?? new Map<number, string[]>();
    const withOrder = listMap.get(entry.order as number) ?? [];
    withOrder.push(entry.label);
    listMap.set(entry.order as number, withOrder);
    orderByList.set(entry.list, listMap);
  }
  for (const [list, listMap] of orderByList) {
    for (const [order, labels] of listMap) {
      if (labels.length > 1) {
        push(`${list}: duplicate order ${order} (${labels.join(", ")})`);
      }
    }
  }

  // --- size budget ---
  if (errors.length === 0) {
    const byteLength = new TextEncoder().encode(
      canonicalStringify(config)
    ).length;
    if (byteLength > MAX_CONFIG_BYTES) {
      push(
        `config canonical size ${byteLength} bytes exceeds ${MAX_CONFIG_BYTES} byte budget`
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, config: null };
  }
  return { ok: true, errors: [], config: config as EventEvaluationConfigV2 };
}
