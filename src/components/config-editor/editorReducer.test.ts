import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { emptyDraft, stampDraft, type ConfigDraft } from "@/evaluation/configDraft";
import { validateEvaluationConfig } from "@/evaluation/configValidation";
import { editorReducer, type EditorAction } from "./editorReducer";

const AT = Timestamp.fromMillis(0);

function apply(draft: ConfigDraft, ...actions: EditorAction[]): ConfigDraft {
  return actions.reduce(editorReducer, draft);
}

function firstCategoryId(draft: ConfigDraft): string {
  return Object.keys(draft.categories)[0];
}

function firstQuestionTypeId(draft: ConfigDraft): string {
  return Object.keys(draft.questionTypes)[0];
}

describe("derived fields are maintained, never typed", () => {
  it("questionCount always equals the number of slots", () => {
    let draft = apply(emptyDraft("v1"), { type: "addCategory" });
    const categoryId = firstCategoryId(draft);

    draft = apply(draft, {
      type: "setCategoryQuestionCount",
      categoryId,
      count: 4,
    });
    expect(draft.categories[categoryId].questionCount).toBe(4);
    expect(draft.categories[categoryId].questionSlots).toHaveLength(4);

    draft = apply(draft, {
      type: "setCategoryQuestionCount",
      categoryId,
      count: 2,
    });
    expect(draft.categories[categoryId].questionCount).toBe(2);
    expect(draft.categories[categoryId].questionSlots).toHaveLength(2);
  });

  it("slot question numbers are always 1..n by position", () => {
    let draft = apply(emptyDraft("v1"), { type: "addCategory" });
    const categoryId = firstCategoryId(draft);
    draft = apply(draft, {
      type: "setCategoryQuestionCount",
      categoryId,
      count: 3,
    });
    expect(
      draft.categories[categoryId].questionSlots.map((s) => s.questionNumber)
    ).toEqual([1, 2, 3]);
  });

  it("inputCount always equals the number of inputs", () => {
    let draft = apply(emptyDraft("v1"), { type: "addQuestionType" });
    const questionTypeId = firstQuestionTypeId(draft);
    draft = apply(
      draft,
      { type: "addInput", questionTypeId },
      { type: "addInput", questionTypeId }
    );
    const qt = draft.questionTypes[questionTypeId];
    expect(qt.inputCount).toBe(3);
    expect(qt.inputs).toHaveLength(3);

    draft = apply(draft, {
      type: "removeInput",
      questionTypeId,
      inputId: qt.inputs[0].id,
    });
    expect(draft.questionTypes[questionTypeId].inputCount).toBe(2);
  });

  it("order is contiguous from 1 after a removal", () => {
    let draft = apply(
      emptyDraft("v1"),
      { type: "addCategory" },
      { type: "addCategory" },
      { type: "addCategory" }
    );
    const ids = Object.keys(draft.categories);
    draft = apply(draft, { type: "removeCategory", categoryId: ids[1] });
    expect(
      Object.values(draft.categories)
        .map((c) => c.order)
        .sort((a, b) => a - b)
    ).toEqual([1, 2]);
  });
});

describe("union fields stay honest across operation changes", () => {
  it("switching subtract -> add moves the cap and leaves no stale key", () => {
    let draft = apply(emptyDraft("v1"), { type: "addQuestionType" });
    const questionTypeId = firstQuestionTypeId(draft);
    draft = apply(draft, { type: "setQuestionTypeCap", questionTypeId, cap: 7 });

    draft = apply(draft, {
      type: "setQuestionTypeOperation",
      questionTypeId,
      operation: "add",
    });

    const qt = draft.questionTypes[questionTypeId] as unknown as Record<
      string,
      unknown
    >;
    expect(qt.operation).toBe("add");
    expect(qt.perSectionAdditionCap).toBe(7);
    // The validator rejects unknown keys, so the old cap must be GONE, not
    // merely ignored.
    expect("perSectionDeductionCap" in qt).toBe(false);
  });

  it("switching an input to informational removes perInputWeight entirely", () => {
    let draft = apply(emptyDraft("v1"), { type: "addQuestionType" });
    const questionTypeId = firstQuestionTypeId(draft);
    const inputId = draft.questionTypes[questionTypeId].inputs[0].id;

    draft = apply(draft, {
      type: "setInput",
      questionTypeId,
      inputId,
      patch: { role: "informational" },
    });

    const input = draft.questionTypes[questionTypeId]
      .inputs[0] as unknown as Record<string, unknown>;
    expect(input.role).toBe("informational");
    expect("perInputWeight" in input).toBe(false);
  });

  it("switching back to scored restores a weight rather than leaving it undefined", () => {
    let draft = apply(emptyDraft("v1"), { type: "addQuestionType" });
    const questionTypeId = firstQuestionTypeId(draft);
    const inputId = draft.questionTypes[questionTypeId].inputs[0].id;

    draft = apply(
      draft,
      {
        type: "setInput",
        questionTypeId,
        inputId,
        patch: { role: "informational" },
      },
      { type: "setInput", questionTypeId, inputId, patch: { role: "scored" } }
    );

    const input = draft.questionTypes[questionTypeId].inputs[0];
    expect(input.role).toBe("scored");
    if (input.role === "scored") expect(input.perInputWeight).toBe(1);
  });
});

describe("a config built entirely through the reducer is publishable", () => {
  it("produces a config that passes the real validator", async () => {
    let draft = apply(
      emptyDraft("built-by-reducer-v1"),
      { type: "addQuestionType" },
      { type: "addCategory" }
    );
    const questionTypeId = firstQuestionTypeId(draft);
    const categoryId = firstCategoryId(draft);

    draft = apply(
      draft,
      {
        type: "setQuestionTypeLabel",
        questionTypeId,
        label: "Recitation",
      },
      { type: "setQuestionTypeCap", questionTypeId, cap: 8 },
      { type: "setCategoryLabel", categoryId, label: "Juz 30" },
      { type: "setCategoryQuestionCount", categoryId, count: 2 },
      {
        type: "setSlotPageRange",
        categoryId,
        index: 0,
        patch: { startPage: 582, endPage: 588 },
      },
      {
        type: "setSlotPageRange",
        categoryId,
        index: 1,
        patch: { startPage: 589, endPage: 595 },
      }
    );

    const stamped = await stampDraft(draft, AT);
    const validation = validateEvaluationConfig(stamped);
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("an override rule added through the reducer validates", async () => {
    let draft = apply(
      emptyDraft("with-rule-v1"),
      { type: "addQuestionType" },
      { type: "addCategory" }
    );
    const categoryId = firstCategoryId(draft);
    draft = apply(
      draft,
      {
        type: "setSlotPageRange",
        categoryId,
        index: 0,
        patch: { startPage: 1, endPage: 20 },
      },
      { type: "addRule" }
    );

    expect(draft.overrideRules).toHaveLength(1);
    const stamped = await stampDraft(draft, AT);
    expect(validateEvaluationConfig(stamped).errors).toEqual([]);
  });
});
