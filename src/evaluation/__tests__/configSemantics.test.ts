import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { buildExampleEvaluationConfig } from "../exampleConfigSeed";
import { draftFromConfig, emptyDraft, stampDraft } from "../configDraft";
import { classifyConfigChange, semanticProjection } from "../configSemantics";
import { computeScoringFingerprint } from "../configHash";
import { validateEvaluationConfig } from "../configValidation";

const AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

/**
 * The property this whole file exists to protect: renaming a label must NOT
 * invalidate scores already recorded, and changing a weight MUST.
 *
 * useParticipants rejects any score whose scoringFingerprint no longer matches
 * the event descriptor. Before the semantic projection, a typo fix in a
 * display label changed that fingerprint and silently emptied the ranking
 * mid-competition.
 */
describe("scoringFingerprint ignores presentation, contentHash does not", () => {
  it("a category label change is cosmetic: fingerprint stable, contentHash moves", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const draft = draftFromConfig(published);

    const renamed = await stampDraft(
      {
        ...draft,
        categories: {
          ...draft.categories,
          CAT_A: {
            ...draft.categories.CAT_A,
            label: { default: "Junior Division" },
          },
        },
      },
      AT
    );

    expect(renamed.scoringFingerprint).toBe(published.scoringFingerprint);
    expect(renamed.contentHash).not.toBe(published.contentHash);
    expect(classifyConfigChange(published, renamed)).toBe("cosmetic");
  });

  it("an assetRef change is cosmetic", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const draft = draftFromConfig(published);

    const reasset = await stampDraft(
      {
        ...draft,
        categories: {
          ...draft.categories,
          CAT_A: { ...draft.categories.CAT_A, assetRef: "categories/other.png" },
        },
      },
      AT
    );

    expect(reasset.scoringFingerprint).toBe(published.scoringFingerprint);
    expect(reasset.contentHash).not.toBe(published.contentHash);
  });

  it("a perInputWeight change is semantic: both hashes move", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const draft = draftFromConfig(published);
    const hifdh = draft.questionTypes.hifdh;

    const reweighted = await stampDraft(
      {
        ...draft,
        questionTypes: {
          ...draft.questionTypes,
          hifdh: {
            ...hifdh,
            inputs: hifdh.inputs.map((input, index) =>
              index === 0 && input.role === "scored"
                ? { ...input, perInputWeight: input.perInputWeight + 1 }
                : input
            ),
          } as typeof hifdh,
        },
      },
      AT
    );

    expect(reweighted.scoringFingerprint).not.toBe(published.scoringFingerprint);
    expect(reweighted.contentHash).not.toBe(published.contentHash);
    expect(classifyConfigChange(published, reweighted)).toBe("semantic");
  });

  it("a page-range change is semantic — it changes which pages can be assigned", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const draft = draftFromConfig(published);
    const catA = draft.categories.CAT_A;

    const reranged = await stampDraft(
      {
        ...draft,
        categories: {
          ...draft.categories,
          CAT_A: {
            ...catA,
            questionSlots: catA.questionSlots.map((slot, index) =>
              index === 0
                ? {
                    ...slot,
                    pageRange: {
                      startPage: slot.pageRange.startPage,
                      endPage: slot.pageRange.endPage + 1,
                    },
                  }
                : slot
            ),
          },
        },
      },
      AT
    );

    expect(reranged.scoringFingerprint).not.toBe(published.scoringFingerprint);
  });

  it("an identical republish changes nothing", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const restamped = await stampDraft(draftFromConfig(published), AT);
    expect(classifyConfigChange(published, restamped)).toBe("none");
  });

  it("the projection strips presentation keys at every depth", () => {
    const projected = semanticProjection({
      scoring: { baseScorePerQuestion: 100 },
      categories: {
        CAT_A: { label: { default: "A" }, assetRef: "x.png", questionCount: 2 },
      },
      questionTypes: {
        t: { groupId: "g", inputs: [{ label: { default: "L" }, perInputWeight: 3 }] },
      },
      overrideRules: [],
      participantAdjustments: {},
    } as never);

    expect(JSON.stringify(projected)).not.toContain("label");
    expect(JSON.stringify(projected)).not.toContain("assetRef");
    expect(JSON.stringify(projected)).not.toContain("groupId");
    expect(JSON.stringify(projected)).toContain("perInputWeight");
    expect(JSON.stringify(projected)).toContain("questionCount");
  });
});

describe("stampDraft", () => {
  it("reproduces the example seed's hashes exactly", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const restamped = await stampDraft(draftFromConfig(published), AT);

    expect(restamped.scoringFingerprint).toBe(published.scoringFingerprint);
    expect(restamped.contentHash).toBe(published.contentHash);
  });

  it("computes the fingerprint before the content hash, so the two agree", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const stamped = await stampDraft(draftFromConfig(published), AT);
    // contentHash covers scoringFingerprint; recomputing the fingerprint
    // independently must land on the same value the config carries.
    expect(await computeScoringFingerprint(stamped)).toBe(
      stamped.scoringFingerprint
    );
  });

  it("produces a config that passes the loader's own validation", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const stamped = await stampDraft(draftFromConfig(published), AT);
    expect(validateEvaluationConfig(stamped).ok).toBe(true);
  });
});

describe("emptyDraft", () => {
  it("is deliberately NOT publishable — no categories, no question types", async () => {
    const stamped = await stampDraft(emptyDraft("brand-new-v1"), AT);
    const validation = validateEvaluationConfig(stamped);
    expect(validation.ok).toBe(false);
  });
});
