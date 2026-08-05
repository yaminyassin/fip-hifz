import type { ConfigDraft } from "@/evaluation/configDraft";
import type {
  CategoryQuestionSlot,
  EvaluationInputDefinition,
  EventCategoryDefinition,
  ParticipantAdjustmentDefinition,
  QuestionOverrideRule,
  QuestionTypeDefinition,
} from "@/evaluation/types";

/**
 * Pure state transitions for the config editor.
 *
 * The rule this file enforces: DERIVED FIELDS ARE NEVER TYPED. `order`,
 * `inputCount`, `questionCount`, and `questionSlots[].questionNumber` are all
 * recomputed from structure on every change. The organizer edits the things
 * that carry meaning — weights, caps, page ranges — and the bookkeeping that
 * has to agree with them is maintained here, where it cannot drift.
 *
 * Kept separate from the React hook so the transitions are directly testable
 * without rendering anything.
 */

let idCounter = 0;
/** Ids for newly-added rows. Config ids are stable identifiers, not display
 * text, so they are generated rather than derived from a (mutable) label. */
function freshId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export type EditorAction =
  | { type: "setConfigVersion"; value: string }
  | { type: "setScoring"; patch: Partial<ConfigDraft["scoring"]> }
  | { type: "addCategory" }
  | { type: "removeCategory"; categoryId: string }
  | { type: "setCategoryLabel"; categoryId: string; label: string }
  | { type: "setCategoryAssetRef"; categoryId: string; assetRef: string }
  | { type: "setCategoryQuestionCount"; categoryId: string; count: number }
  | {
      type: "setSlotPageRange";
      categoryId: string;
      index: number;
      patch: Partial<CategoryQuestionSlot["pageRange"]>;
    }
  | {
      type: "setSlotJuzRange";
      categoryId: string;
      index: number;
      range: { start: number; end: number } | null;
    }
  | { type: "addQuestionType" }
  | { type: "removeQuestionType"; questionTypeId: string }
  | { type: "setQuestionTypeLabel"; questionTypeId: string; label: string }
  | {
      type: "setQuestionTypeOperation";
      questionTypeId: string;
      operation: "add" | "subtract";
    }
  | { type: "setQuestionTypeCap"; questionTypeId: string; cap: number }
  | { type: "addInput"; questionTypeId: string }
  | { type: "removeInput"; questionTypeId: string; inputId: string }
  | {
      type: "setInput";
      questionTypeId: string;
      inputId: string;
      patch: Partial<EvaluationInputDefinition> & { perInputWeight?: number };
    }
  | { type: "addAdjustment" }
  | { type: "removeAdjustment"; adjustmentId: string }
  | { type: "setAdjustmentLabel"; adjustmentId: string; label: string }
  | {
      type: "setAdjustmentOperation";
      adjustmentId: string;
      operation: "add" | "subtract";
    }
  | { type: "setAdjustmentCap"; adjustmentId: string; cap: number }
  | { type: "addAdjustmentInput"; adjustmentId: string }
  | { type: "removeAdjustmentInput"; adjustmentId: string; inputId: string }
  | {
      type: "setAdjustmentInput";
      adjustmentId: string;
      inputId: string;
      patch: Partial<EvaluationInputDefinition> & { perInputWeight?: number };
    }
  | { type: "addRule" }
  | { type: "removeRule"; ruleId: string }
  | { type: "setRule"; ruleId: string; patch: Partial<QuestionOverrideRule> }
  | { type: "replaceDraft"; draft: ConfigDraft };

// ---------- derived-field maintenance ----------

/** Renumbers `order` by current position so it always matches display order. */
function renumber<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function reindexInputs(
  inputs: readonly EvaluationInputDefinition[]
): EvaluationInputDefinition[] {
  return renumber([...inputs]);
}

/** questionCount is the slot count, and slot numbers are 1..n by position. */
function normalizeCategory(
  category: EventCategoryDefinition
): EventCategoryDefinition {
  const questionSlots = category.questionSlots.map((slot, index) => ({
    ...slot,
    questionNumber: index + 1,
  }));
  return {
    ...category,
    questionSlots,
    questionCount: questionSlots.length,
  };
}

function withCategories(
  draft: ConfigDraft,
  categories: Record<string, EventCategoryDefinition>
): ConfigDraft {
  const ordered = renumber(
    Object.values(categories).sort((a, b) => a.order - b.order)
  ).map(normalizeCategory);
  return {
    ...draft,
    categories: Object.fromEntries(ordered.map((c) => [c.id, c])),
  };
}

function withQuestionTypes(
  draft: ConfigDraft,
  questionTypes: Record<string, QuestionTypeDefinition>
): ConfigDraft {
  const ordered = renumber(
    Object.values(questionTypes).sort((a, b) => a.order - b.order)
  ).map((qt) => {
    const inputs = reindexInputs(qt.inputs);
    return { ...qt, inputs, inputCount: inputs.length } as QuestionTypeDefinition;
  });
  return {
    ...draft,
    questionTypes: Object.fromEntries(ordered.map((q) => [q.id, q])),
  };
}

function withAdjustments(
  draft: ConfigDraft,
  adjustments: Record<string, ParticipantAdjustmentDefinition>
): ConfigDraft {
  const ordered = renumber(
    Object.values(adjustments).sort((a, b) => a.order - b.order)
  ).map((adj) => {
    const inputs = reindexInputs(adj.inputs);
    return {
      ...adj,
      inputs,
      inputCount: inputs.length,
    } as ParticipantAdjustmentDefinition;
  });
  return {
    ...draft,
    participantAdjustments: Object.fromEntries(ordered.map((a) => [a.id, a])),
  };
}

// ---------- factories ----------

function newSlot(questionNumber: number): CategoryQuestionSlot {
  return {
    questionNumber,
    pageRange: { startPage: 1, endPage: 10 },
  };
}

function newInput(order: number): EvaluationInputDefinition {
  return {
    id: freshId("input"),
    label: { default: "New input" },
    order,
    control: "integerCounter",
    min: 0,
    max: 10,
    step: 1,
    role: "scored",
    perInputWeight: 1,
  };
}

// ---------- reducer ----------

export function editorReducer(
  draft: ConfigDraft,
  action: EditorAction
): ConfigDraft {
  switch (action.type) {
    case "replaceDraft":
      return action.draft;

    case "setConfigVersion":
      return { ...draft, configVersion: action.value };

    case "setScoring":
      return { ...draft, scoring: { ...draft.scoring, ...action.patch } };

    // ---- categories ----

    case "addCategory": {
      const id = freshId("CAT");
      const order = Object.keys(draft.categories).length + 1;
      return withCategories(draft, {
        ...draft.categories,
        [id]: {
          id,
          label: { default: "New category" },
          order,
          questionCount: 1,
          questionSlots: [newSlot(1)],
        },
      });
    }

    case "removeCategory": {
      const { [action.categoryId]: _removed, ...rest } = draft.categories;
      void _removed;
      return withCategories(draft, rest);
    }

    case "setCategoryLabel": {
      const category = draft.categories[action.categoryId];
      if (!category) return draft;
      return withCategories(draft, {
        ...draft.categories,
        [action.categoryId]: { ...category, label: { default: action.label } },
      });
    }

    case "setCategoryAssetRef": {
      const category = draft.categories[action.categoryId];
      if (!category) return draft;
      const next = { ...category };
      if (action.assetRef.trim() === "") delete next.assetRef;
      else next.assetRef = action.assetRef;
      return withCategories(draft, {
        ...draft.categories,
        [action.categoryId]: next,
      });
    }

    case "setCategoryQuestionCount": {
      const category = draft.categories[action.categoryId];
      if (!category) return draft;
      // Guard rails, not validation: the validator owns the real bounds, but
      // a NaN or negative count here would produce a broken slot array before
      // validation ever ran.
      const count = Math.max(1, Math.min(50, Math.floor(action.count) || 1));
      const slots = [...category.questionSlots];
      while (slots.length < count) slots.push(newSlot(slots.length + 1));
      slots.length = count;
      return withCategories(draft, {
        ...draft.categories,
        [action.categoryId]: { ...category, questionSlots: slots },
      });
    }

    case "setSlotPageRange": {
      const category = draft.categories[action.categoryId];
      if (!category) return draft;
      const slots = category.questionSlots.map((slot, index) =>
        index === action.index
          ? { ...slot, pageRange: { ...slot.pageRange, ...action.patch } }
          : slot
      );
      return withCategories(draft, {
        ...draft.categories,
        [action.categoryId]: { ...category, questionSlots: slots },
      });
    }

    case "setSlotJuzRange": {
      const category = draft.categories[action.categoryId];
      if (!category) return draft;
      const slots = category.questionSlots.map((slot, index) => {
        if (index !== action.index) return slot;
        const next = { ...slot };
        if (action.range === null) delete next.sourceJuzRange;
        else next.sourceJuzRange = action.range;
        return next;
      });
      return withCategories(draft, {
        ...draft.categories,
        [action.categoryId]: { ...category, questionSlots: slots },
      });
    }

    // ---- question types ----

    case "addQuestionType": {
      const id = freshId("qt");
      const order = Object.keys(draft.questionTypes).length + 1;
      return withQuestionTypes(draft, {
        ...draft.questionTypes,
        [id]: {
          id,
          label: { default: "New section" },
          order,
          operation: "subtract",
          perSectionDeductionCap: 10,
          inputCount: 1,
          inputs: [newInput(1)],
        },
      });
    }

    case "removeQuestionType": {
      const { [action.questionTypeId]: _removed, ...rest } = draft.questionTypes;
      void _removed;
      return withQuestionTypes(draft, rest);
    }

    case "setQuestionTypeLabel": {
      const qt = draft.questionTypes[action.questionTypeId];
      if (!qt) return draft;
      return withQuestionTypes(draft, {
        ...draft.questionTypes,
        [action.questionTypeId]: { ...qt, label: { default: action.label } },
      });
    }

    case "setQuestionTypeOperation": {
      const qt = draft.questionTypes[action.questionTypeId];
      if (!qt) return draft;
      // The cap field's NAME depends on the operation, so switching operation
      // has to move the value across rather than leave both keys present —
      // the validator rejects unknown keys.
      const cap =
        qt.operation === "subtract"
          ? qt.perSectionDeductionCap
          : qt.perSectionAdditionCap;
      const common = {
        id: qt.id,
        label: qt.label,
        order: qt.order,
        inputCount: qt.inputCount,
        inputs: qt.inputs,
      };
      const next: QuestionTypeDefinition =
        action.operation === "subtract"
          ? { ...common, operation: "subtract", perSectionDeductionCap: cap }
          : { ...common, operation: "add", perSectionAdditionCap: cap };
      return withQuestionTypes(draft, {
        ...draft.questionTypes,
        [action.questionTypeId]: next,
      });
    }

    case "setQuestionTypeCap": {
      const qt = draft.questionTypes[action.questionTypeId];
      if (!qt) return draft;
      const next: QuestionTypeDefinition =
        qt.operation === "subtract"
          ? { ...qt, perSectionDeductionCap: action.cap }
          : { ...qt, perSectionAdditionCap: action.cap };
      return withQuestionTypes(draft, {
        ...draft.questionTypes,
        [action.questionTypeId]: next,
      });
    }

    case "addInput": {
      const qt = draft.questionTypes[action.questionTypeId];
      if (!qt) return draft;
      return withQuestionTypes(draft, {
        ...draft.questionTypes,
        [action.questionTypeId]: {
          ...qt,
          inputs: [...qt.inputs, newInput(qt.inputs.length + 1)],
        } as QuestionTypeDefinition,
      });
    }

    case "removeInput": {
      const qt = draft.questionTypes[action.questionTypeId];
      if (!qt) return draft;
      return withQuestionTypes(draft, {
        ...draft.questionTypes,
        [action.questionTypeId]: {
          ...qt,
          inputs: qt.inputs.filter((i) => i.id !== action.inputId),
        } as QuestionTypeDefinition,
      });
    }

    case "setInput": {
      const qt = draft.questionTypes[action.questionTypeId];
      if (!qt) return draft;
      return withQuestionTypes(draft, {
        ...draft.questionTypes,
        [action.questionTypeId]: {
          ...qt,
          inputs: qt.inputs.map((input) =>
            input.id === action.inputId ? applyInputPatch(input, action.patch) : input
          ),
        } as QuestionTypeDefinition,
      });
    }

    // ---- participant adjustments ----

    case "addAdjustment": {
      const id = freshId("adj");
      const order = Object.keys(draft.participantAdjustments).length + 1;
      return withAdjustments(draft, {
        ...draft.participantAdjustments,
        [id]: {
          id,
          label: { default: "New adjustment" },
          order,
          scope: "participantJury",
          operation: "add",
          additionCap: 5,
          inputCount: 1,
          inputs: [newInput(1)],
        },
      });
    }

    case "removeAdjustment": {
      const { [action.adjustmentId]: _removed, ...rest } =
        draft.participantAdjustments;
      void _removed;
      return withAdjustments(draft, rest);
    }

    case "setAdjustmentLabel": {
      const adj = draft.participantAdjustments[action.adjustmentId];
      if (!adj) return draft;
      return withAdjustments(draft, {
        ...draft.participantAdjustments,
        [action.adjustmentId]: { ...adj, label: { default: action.label } },
      });
    }

    case "setAdjustmentOperation": {
      const adj = draft.participantAdjustments[action.adjustmentId];
      if (!adj) return draft;
      const cap = adj.operation === "add" ? adj.additionCap : adj.deductionCap;
      const common = {
        id: adj.id,
        label: adj.label,
        order: adj.order,
        scope: adj.scope,
        inputCount: adj.inputCount,
        inputs: adj.inputs,
      };
      const next: ParticipantAdjustmentDefinition =
        action.operation === "add"
          ? { ...common, operation: "add", additionCap: cap }
          : { ...common, operation: "subtract", deductionCap: cap };
      return withAdjustments(draft, {
        ...draft.participantAdjustments,
        [action.adjustmentId]: next,
      });
    }

    case "setAdjustmentCap": {
      const adj = draft.participantAdjustments[action.adjustmentId];
      if (!adj) return draft;
      const next: ParticipantAdjustmentDefinition =
        adj.operation === "add"
          ? { ...adj, additionCap: action.cap }
          : { ...adj, deductionCap: action.cap };
      return withAdjustments(draft, {
        ...draft.participantAdjustments,
        [action.adjustmentId]: next,
      });
    }

    case "addAdjustmentInput": {
      const adj = draft.participantAdjustments[action.adjustmentId];
      if (!adj) return draft;
      return withAdjustments(draft, {
        ...draft.participantAdjustments,
        [action.adjustmentId]: {
          ...adj,
          inputs: [...adj.inputs, newInput(adj.inputs.length + 1)],
        } as ParticipantAdjustmentDefinition,
      });
    }

    case "removeAdjustmentInput": {
      const adj = draft.participantAdjustments[action.adjustmentId];
      if (!adj) return draft;
      return withAdjustments(draft, {
        ...draft.participantAdjustments,
        [action.adjustmentId]: {
          ...adj,
          inputs: adj.inputs.filter((i) => i.id !== action.inputId),
        } as ParticipantAdjustmentDefinition,
      });
    }

    case "setAdjustmentInput": {
      const adj = draft.participantAdjustments[action.adjustmentId];
      if (!adj) return draft;
      return withAdjustments(draft, {
        ...draft.participantAdjustments,
        [action.adjustmentId]: {
          ...adj,
          inputs: adj.inputs.map((input) =>
            input.id === action.inputId ? applyInputPatch(input, action.patch) : input
          ),
        } as ParticipantAdjustmentDefinition,
      });
    }

    // ---- override rules ----

    case "addRule": {
      const questionTypeId = Object.keys(draft.questionTypes)[0];
      const inputId = questionTypeId
        ? draft.questionTypes[questionTypeId].inputs[0]?.id
        : undefined;
      if (!questionTypeId || !inputId) return draft;
      const priority =
        draft.overrideRules.reduce((max, r) => Math.max(max, r.priority), 0) + 1;
      return {
        ...draft,
        overrideRules: [
          ...draft.overrideRules,
          {
            id: freshId("rule"),
            priority,
            when: {
              kind: "all",
              conditions: [
                { input: { questionTypeId, inputId }, operator: "gte", value: 1 },
              ],
            },
            action: { kind: "voidQuestion" },
          },
        ],
      };
    }

    case "removeRule":
      return {
        ...draft,
        overrideRules: draft.overrideRules.filter((r) => r.id !== action.ruleId),
      };

    case "setRule":
      return {
        ...draft,
        overrideRules: draft.overrideRules.map((rule) =>
          rule.id === action.ruleId ? { ...rule, ...action.patch } : rule
        ),
      };

    default:
      return draft;
  }
}

/**
 * Applies a patch to an input, keeping the role/weight union honest: a
 * `scored` input carries perInputWeight and an `informational` one must not,
 * because the validator rejects unknown keys.
 */
function applyInputPatch(
  input: EvaluationInputDefinition,
  patch: Partial<EvaluationInputDefinition> & { perInputWeight?: number }
): EvaluationInputDefinition {
  const merged = { ...input, ...patch } as Record<string, unknown>;
  const role = (patch.role ?? input.role) as "scored" | "informational";

  if (role === "informational") {
    delete merged.perInputWeight;
    return { ...merged, role: "informational" } as EvaluationInputDefinition;
  }

  const existingWeight =
    input.role === "scored" ? input.perInputWeight : undefined;
  return {
    ...merged,
    role: "scored",
    perInputWeight: patch.perInputWeight ?? existingWeight ?? 1,
  } as EvaluationInputDefinition;
}
