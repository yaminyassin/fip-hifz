import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { editorReducer, type EditorAction } from "@/components/config-editor/editorReducer";
import { emptyDraft, stampDraft, type ConfigDraft } from "../configDraft";
import { validateEvaluationConfig } from "../configValidation";
import {
  collectConfigIds,
  normalizeGeneratedIds,
  slugifyConfigId,
} from "../configIds";

const AT = Timestamp.fromMillis(0);

function apply(draft: ConfigDraft, ...actions: EditorAction[]): ConfigDraft {
  return actions.reduce(editorReducer, draft);
}

/** Builds the Porto-2027-shaped draft the way the editor actually would. */
function buildPortoDraft(): ConfigDraft {
  const draft = apply(
    emptyDraft("porto-2027-v1"),
    { type: "addQuestionType" },
    { type: "addCategory" }
  );
  const questionTypeId = Object.keys(draft.questionTypes)[0];
  const categoryId = Object.keys(draft.categories)[0];
  const inputId = draft.questionTypes[questionTypeId].inputs[0].id;

  return apply(
    draft,
    {
      type: "setQuestionTypeLabel",
      questionTypeId,
      label: "Recitation",
    },
    {
      type: "setInput",
      questionTypeId,
      inputId,
      patch: { label: { default: "Verse Skip" } },
    },
    { type: "setCategoryLabel", categoryId, label: "Juz 30" },
    {
      type: "setSlotPageRange",
      categoryId,
      index: 0,
      patch: { startPage: 582, endPage: 588 },
    },
    { type: "addRule" }
  );
}

describe("slugifyConfigId", () => {
  it("produces snake_case matching the ids already in the wild", () => {
    expect(slugifyConfigId("Juz 30")).toBe("juz_30");
    expect(slugifyConfigId("Word Slip")).toBe("word_slip");
    expect(slugifyConfigId("Adab Bonus")).toBe("adab_bonus");
    expect(slugifyConfigId("Half Quran")).toBe("half_quran");
  });

  it("strips accents and punctuation rather than encoding them", () => {
    expect(slugifyConfigId("Recitação — Nível 1")).toBe("recitacao_nivel_1");
    expect(slugifyConfigId("  spaced  out  ")).toBe("spaced_out");
  });

  it("returns empty for a label with nothing sluggable", () => {
    expect(slugifyConfigId("🎉")).toBe("");
    expect(slugifyConfigId("---")).toBe("");
  });
});

describe("normalizeGeneratedIds on a brand-new config", () => {
  it("replaces every placeholder id with one derived from its label", () => {
    const { draft } = normalizeGeneratedIds(buildPortoDraft());

    expect(Object.keys(draft.categories)).toEqual(["juz_30"]);
    expect(Object.keys(draft.questionTypes)).toEqual(["recitation"]);
    expect(draft.questionTypes.recitation.inputs[0].id).toBe("verse_skip");
  });

  it("keeps each record's key and embedded id in agreement", () => {
    const { draft } = normalizeGeneratedIds(buildPortoDraft());
    for (const [key, category] of Object.entries(draft.categories)) {
      expect(category.id).toBe(key);
    }
    for (const [key, questionType] of Object.entries(draft.questionTypes)) {
      expect(questionType.id).toBe(key);
    }
  });

  it("rewrites override-rule references so the rules can still fire", () => {
    const { draft } = normalizeGeneratedIds(buildPortoDraft());
    const condition = draft.overrideRules[0].when.conditions[0];
    expect(condition.input.questionTypeId).toBe("recitation");
    expect(condition.input.inputId).toBe("verse_skip");
  });

  it("rewrites a setSectionImpact action's questionTypeId", () => {
    const base = buildPortoDraft();
    const questionTypeId = Object.keys(base.questionTypes)[0];
    const withImpact: ConfigDraft = {
      ...base,
      overrideRules: [
        {
          ...base.overrideRules[0],
          action: { kind: "setSectionImpact", questionTypeId, impact: 3 },
        },
      ],
    };

    const { draft } = normalizeGeneratedIds(withImpact);
    const action = draft.overrideRules[0].action;
    expect(action.kind).toBe("setSectionImpact");
    if (action.kind === "setSectionImpact") {
      expect(action.questionTypeId).toBe("recitation");
    }
  });

  it("still validates after renaming", async () => {
    const { draft } = normalizeGeneratedIds(buildPortoDraft());
    const stamped = await stampDraft(draft, AT);
    expect(validateEvaluationConfig(stamped).errors).toEqual([]);
  });

  it("disambiguates two categories sharing a label", () => {
    let base = apply(
      emptyDraft("dup-v1"),
      { type: "addQuestionType" },
      { type: "addCategory" },
      { type: "addCategory" }
    );
    const [first, second] = Object.keys(base.categories);
    base = apply(
      base,
      { type: "setCategoryLabel", categoryId: first, label: "Juz 30" },
      { type: "setCategoryLabel", categoryId: second, label: "Juz 30" }
    );

    const { draft } = normalizeGeneratedIds(base);
    expect(Object.keys(draft.categories).sort()).toEqual(["juz_30", "juz_30_2"]);
  });

  it("leaves an unsluggable label on its placeholder rather than an empty id", () => {
    let base = apply(emptyDraft("emoji-v1"), { type: "addQuestionType" }, { type: "addCategory" });
    const categoryId = Object.keys(base.categories)[0];
    base = apply(base, { type: "setCategoryLabel", categoryId, label: "🎉" });

    const { draft } = normalizeGeneratedIds(base);
    expect(Object.keys(draft.categories)).toEqual([categoryId]);
    expect(Object.keys(draft.categories)[0]).not.toBe("");
  });
});

describe("published ids are frozen", () => {
  it("never renames an id that already exists in the published config", async () => {
    const { draft: published } = normalizeGeneratedIds(buildPortoDraft());
    const publishedIds = collectConfigIds(published);

    // The organizer renames a category AFTER publishing. Its id must not move:
    // every recorded score references categoryId, and assignment hashes are
    // computed over it.
    const renamed = apply(published, {
      type: "setCategoryLabel",
      categoryId: "juz_30",
      label: "Juz Thirty (Renamed)",
    });

    const { draft, renamed: moves } = normalizeGeneratedIds(renamed, publishedIds);
    expect(Object.keys(draft.categories)).toEqual(["juz_30"]);
    expect(draft.categories.juz_30.label.default).toBe("Juz Thirty (Renamed)");
    expect(moves.size).toBe(0);
  });

  it("gives a NEWLY added row a readable id while leaving published ones alone", () => {
    const { draft: published } = normalizeGeneratedIds(buildPortoDraft());
    const publishedIds = collectConfigIds(published);

    let next = apply(published, { type: "addCategory" });
    const addedId = Object.keys(next.categories).find((id) => id !== "juz_30")!;
    next = apply(next, {
      type: "setCategoryLabel",
      categoryId: addedId,
      label: "Half Quran",
    });

    const { draft } = normalizeGeneratedIds(next, publishedIds);
    expect(Object.keys(draft.categories).sort()).toEqual(["half_quran", "juz_30"]);
  });

  it("is idempotent — re-normalizing a normalized config changes nothing", () => {
    const first = normalizeGeneratedIds(buildPortoDraft());
    const second = normalizeGeneratedIds(first.draft, collectConfigIds(first.draft));
    expect(second.renamed.size).toBe(0);
    expect(JSON.stringify(second.draft)).toBe(JSON.stringify(first.draft));
  });
});

describe("collectConfigIds", () => {
  it("collects ids at every level, including nested inputs", () => {
    const { draft } = normalizeGeneratedIds(buildPortoDraft());
    const ids = collectConfigIds(draft);
    expect(ids.has("juz_30")).toBe(true);
    expect(ids.has("recitation")).toBe(true);
    expect(ids.has("verse_skip")).toBe(true);
  });
});
