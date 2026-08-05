import type { ConfigDraft } from "./configDraft";
import type {
  EvaluationInputDefinition,
  EventCategoryDefinition,
  ParticipantAdjustmentDefinition,
  QuestionOverrideRule,
  QuestionTypeDefinition,
} from "./types";

/**
 * Turns the editor's placeholder ids into meaningful ones, derived from the
 * labels the organizer actually typed.
 *
 * The editor has to mint an id the moment a row is added, before any label
 * exists, so it uses a counter: CAT_14, qt_3, input_12. Those ids are not
 * private — `categoryId` is stamped into every score document, appears in the
 * jury header and in exports, and is what an operator sees when reading
 * Firestore. They are also session-dependent: the counter reflects how many
 * rows were added and removed while editing, so two organizers building the
 * same competition end up with different ids.
 *
 * So this runs once, at PUBLISH time, when the labels are known.
 *
 * THE SAFETY RULE: an id that has already been published is NEVER changed.
 * Score documents reference `categoryId`, and assignment hashes are computed
 * over the category id, so renaming a published id would orphan real data.
 * Only ids that still look generated AND are absent from the published config
 * are rewritten — which means, in practice, only ids no score can reference
 * yet.
 */

/** Ids this module minted; anything else was chosen deliberately. */
const GENERATED_ID = /^(CAT|qt|adj|input|rule)_\d+$/;

/**
 * snake_case, matching the ids already in the wild (`hifdh`,
 * `judge_correction`, `overall_bonus`) rather than inventing a third
 * convention.
 */
export function slugifyConfigId(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Allocates `base`, or `base_2`, `base_3`… if it is taken. */
function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  throw new Error(`unable to allocate a unique config id for "${base}"`);
}

/**
 * Decides the id for one entity. Returns the existing id unchanged when it is
 * published, deliberately chosen, or produces an empty slug.
 */
function resolveId(
  currentId: string,
  label: string,
  publishedIds: ReadonlySet<string>,
  taken: Set<string>
): string {
  if (publishedIds.has(currentId) || !GENERATED_ID.test(currentId)) {
    taken.add(currentId);
    return currentId;
  }
  const slug = slugifyConfigId(label);
  if (slug === "") {
    // A label of only punctuation or emoji. Keeping the placeholder is worse
    // than nothing but better than an empty id, which the validator rejects.
    taken.add(currentId);
    return currentId;
  }
  return uniqueId(slug, taken);
}

function remapInputs(
  inputs: readonly EvaluationInputDefinition[],
  publishedIds: ReadonlySet<string>
): { inputs: EvaluationInputDefinition[]; map: Map<string, string> } {
  const taken = new Set<string>();
  const map = new Map<string, string>();
  const next = inputs.map((input) => {
    const id = resolveId(input.id, input.label.default, publishedIds, taken);
    map.set(input.id, id);
    return { ...input, id } as EvaluationInputDefinition;
  });
  return { inputs: next, map };
}

export interface IdNormalizationResult {
  draft: ConfigDraft;
  /** old id -> new id, for anything that moved. Empty when nothing changed. */
  renamed: Map<string, string>;
}

/**
 * @param publishedIds every id present in the currently published config.
 *        Pass an empty set when creating a brand-new event.
 */
export function normalizeGeneratedIds(
  draft: ConfigDraft,
  publishedIds: ReadonlySet<string> = new Set()
): IdNormalizationResult {
  const renamed = new Map<string, string>();

  // ---- question types, and the inputs inside them ----
  const questionTypeIds = new Set<string>();
  // old questionTypeId -> (old inputId -> new inputId)
  const inputMaps = new Map<string, Map<string, string>>();
  const questionTypes: Record<string, QuestionTypeDefinition> = {};

  for (const questionType of Object.values(draft.questionTypes).sort(
    (a, b) => a.order - b.order
  )) {
    const id = resolveId(
      questionType.id,
      questionType.label.default,
      publishedIds,
      questionTypeIds
    );
    if (id !== questionType.id) renamed.set(questionType.id, id);

    const { inputs, map } = remapInputs(questionType.inputs, publishedIds);
    for (const [oldId, newId] of map) {
      if (oldId !== newId) renamed.set(oldId, newId);
    }
    inputMaps.set(questionType.id, map);

    questionTypes[id] = { ...questionType, id, inputs } as QuestionTypeDefinition;
  }

  // Old questionTypeId -> new, so rules can be rewritten.
  const questionTypeRename = new Map<string, string>();
  for (const questionType of Object.values(draft.questionTypes)) {
    const moved = renamed.get(questionType.id);
    questionTypeRename.set(questionType.id, moved ?? questionType.id);
  }

  // ---- categories ----
  const categoryIds = new Set<string>();
  const categories: Record<string, EventCategoryDefinition> = {};
  for (const category of Object.values(draft.categories).sort(
    (a, b) => a.order - b.order
  )) {
    const id = resolveId(
      category.id,
      category.label.default,
      publishedIds,
      categoryIds
    );
    if (id !== category.id) renamed.set(category.id, id);
    categories[id] = { ...category, id };
  }

  // ---- participant adjustments, and their inputs ----
  const adjustmentIds = new Set<string>();
  const participantAdjustments: Record<string, ParticipantAdjustmentDefinition> = {};
  for (const adjustment of Object.values(draft.participantAdjustments).sort(
    (a, b) => a.order - b.order
  )) {
    const id = resolveId(
      adjustment.id,
      adjustment.label.default,
      publishedIds,
      adjustmentIds
    );
    if (id !== adjustment.id) renamed.set(adjustment.id, id);
    const { inputs, map } = remapInputs(adjustment.inputs, publishedIds);
    for (const [oldId, newId] of map) {
      if (oldId !== newId) renamed.set(oldId, newId);
    }
    participantAdjustments[id] = {
      ...adjustment,
      id,
      inputs,
    } as ParticipantAdjustmentDefinition;
  }

  // ---- override rules, which REFERENCE the ids above ----
  // Renaming a question type or input without rewriting these would produce a
  // config that validates structurally but whose rules can never fire.
  const ruleIds = new Set<string>();
  const overrideRules: QuestionOverrideRule[] = draft.overrideRules.map((rule) => {
    const conditions = rule.when.conditions.map((condition) => {
      const oldQuestionTypeId = condition.input.questionTypeId;
      const questionTypeId =
        questionTypeRename.get(oldQuestionTypeId) ?? oldQuestionTypeId;
      const inputId =
        inputMaps.get(oldQuestionTypeId)?.get(condition.input.inputId) ??
        condition.input.inputId;
      return { ...condition, input: { questionTypeId, inputId } };
    });

    let action = rule.action;
    if (action.kind === "setSectionImpact") {
      action = {
        ...action,
        questionTypeId:
          questionTypeRename.get(action.questionTypeId) ?? action.questionTypeId,
      };
    }

    // A rule's own id is never referenced by anything else, but a readable one
    // is worth having in a validation message.
    const id = resolveId(
      rule.id,
      `${conditions[0]?.input.inputId ?? "rule"}_${action.kind}`,
      publishedIds,
      ruleIds
    );
    if (id !== rule.id) renamed.set(rule.id, id);

    return { ...rule, id, when: { ...rule.when, conditions }, action };
  });

  return {
    draft: {
      ...draft,
      categories,
      questionTypes,
      participantAdjustments,
      overrideRules,
    },
    renamed,
  };
}

/** Every id in a config, for use as `publishedIds`. */
export function collectConfigIds(
  config: Pick<
    ConfigDraft,
    "categories" | "questionTypes" | "participantAdjustments" | "overrideRules"
  >
): Set<string> {
  const ids = new Set<string>();
  for (const category of Object.values(config.categories)) ids.add(category.id);
  for (const questionType of Object.values(config.questionTypes)) {
    ids.add(questionType.id);
    for (const input of questionType.inputs) ids.add(input.id);
  }
  for (const adjustment of Object.values(config.participantAdjustments)) {
    ids.add(adjustment.id);
    for (const input of adjustment.inputs) ids.add(input.id);
  }
  for (const rule of config.overrideRules) ids.add(rule.id);
  return ids;
}
