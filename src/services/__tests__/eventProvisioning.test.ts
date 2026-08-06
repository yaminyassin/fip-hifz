import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";

// eventProvisioning imports the live Firestore instance from @/main purely for
// its default db argument; the pure functions under test never touch it.
vi.mock("@/main", () => ({ firestore: {} }));

import { buildExampleEvaluationConfig } from "@/evaluation/exampleConfigSeed";
import { draftFromConfig, emptyDraft } from "@/evaluation/configDraft";
import { evaluateEditGuard, preflight } from "../eventProvisioning";

const AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));
const EVENT_ID = "guard-test-event";

const noneInUse = new Set<string>();

describe("preflight", () => {
  it("accepts a config that round-trips through the real loader", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const result = await preflight(EVENT_ID, draftFromConfig(published), AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.contentHash).toBe(published.contentHash);
    }
  });

  it("rejects an empty draft with the validator's own messages", async () => {
    const result = await preflight(EVENT_ID, emptyDraft("empty-v1"), AT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("at least one category");
    }
  });

  it("rejects a draft whose page range is inverted", async () => {
    const published = await buildExampleEvaluationConfig(AT);
    const draft = draftFromConfig(published);
    const catA = draft.categories.CAT_A;

    const result = await preflight(
      EVENT_ID,
      {
        ...draft,
        categories: {
          ...draft.categories,
          CAT_A: {
            ...catA,
            questionSlots: catA.questionSlots.map((slot, index) =>
              index === 0
                ? { ...slot, pageRange: { startPage: 99, endPage: 3 } }
                : slot
            ),
          },
        },
      },
      AT
    );
    expect(result.ok).toBe(false);
  });
});

describe("evaluateEditGuard", () => {
  async function configs() {
    const published = await buildExampleEvaluationConfig(AT);
    return { published, draft: draftFromConfig(published) };
  }

  it("reports no change for an identical republish", async () => {
    const { published } = await configs();
    expect(
      evaluateEditGuard({
        published,
        candidate: published,
        categoriesInUse: noneInUse,
        categoriesWithAssignments: noneInUse,
        evaluationDocumentCount: 500,
      })
    ).toEqual({ kind: "none" });
  });

  it("allows a cosmetic edit even with scores already recorded", async () => {
    const { published, draft } = await configs();
    const { stampDraft } = await import("@/evaluation/configDraft");
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

    const verdict = evaluateEditGuard({
      published,
      candidate: renamed,
      categoriesInUse: new Set(["CAT_A"]),
      categoriesWithAssignments: new Set(["CAT_A"]),
      evaluationDocumentCount: 42,
    });
    expect(verdict.kind).toBe("allow");
  });

  it("allows a semantic edit when nothing has been scored yet", async () => {
    const { published, draft } = await configs();
    const { stampDraft } = await import("@/evaluation/configDraft");
    const rebased = await stampDraft(
      { ...draft, scoring: { ...draft.scoring, baseScorePerQuestion: 50 } },
      AT
    );

    const verdict = evaluateEditGuard({
      published,
      candidate: rebased,
      categoriesInUse: new Set(["CAT_A"]),
      categoriesWithAssignments: noneInUse,
      evaluationDocumentCount: 0,
    });
    expect(verdict.kind).toBe("allow");
  });

  it("requires a rescore acknowledgement for a semantic edit with existing scores", async () => {
    const { published, draft } = await configs();
    const { stampDraft } = await import("@/evaluation/configDraft");
    const rebased = await stampDraft(
      { ...draft, scoring: { ...draft.scoring, baseScorePerQuestion: 50 } },
      AT
    );

    const verdict = evaluateEditGuard({
      published,
      candidate: rebased,
      categoriesInUse: new Set(["CAT_A"]),
      categoriesWithAssignments: noneInUse,
      evaluationDocumentCount: 12,
    });
    expect(verdict.kind).toBe("requireRescore");
    if (verdict.kind === "requireRescore") {
      expect(verdict.affectedDocuments).toBe(12);
    }
  });

  it("blocks deleting a category that still has participants", async () => {
    const { published, draft } = await configs();
    const { stampDraft } = await import("@/evaluation/configDraft");
    const { CAT_A: _dropped, ...remaining } = draft.categories;
    void _dropped;
    const without = await stampDraft({ ...draft, categories: remaining }, AT);

    const verdict = evaluateEditGuard({
      published,
      candidate: without,
      categoriesInUse: new Set(["CAT_A"]),
      categoriesWithAssignments: noneInUse,
      evaluationDocumentCount: 0,
    });
    expect(verdict.kind).toBe("block");
    if (verdict.kind === "block") {
      expect(verdict.reason).toContain("CAT_A");
    }
  });

  it("blocks changing questionCount for a category with live assignments", async () => {
    const { published, draft } = await configs();
    const { stampDraft } = await import("@/evaluation/configDraft");
    const catA = draft.categories.CAT_A;
    const extended = await stampDraft(
      {
        ...draft,
        categories: {
          ...draft.categories,
          CAT_A: {
            ...catA,
            questionCount: catA.questionCount + 1,
            questionSlots: [
              ...catA.questionSlots,
              {
                questionNumber: catA.questionCount + 1,
                pageRange: { startPage: 102, endPage: 120 },
              },
            ],
          },
        },
      },
      AT
    );

    const verdict = evaluateEditGuard({
      published,
      candidate: extended,
      categoriesInUse: new Set(["CAT_A"]),
      categoriesWithAssignments: new Set(["CAT_A"]),
      evaluationDocumentCount: 0,
    });
    expect(verdict.kind).toBe("block");
  });

  it("allows a questionCount change when no participant has assignments yet", async () => {
    const { published, draft } = await configs();
    const { stampDraft } = await import("@/evaluation/configDraft");
    const catA = draft.categories.CAT_A;
    const extended = await stampDraft(
      {
        ...draft,
        categories: {
          ...draft.categories,
          CAT_A: {
            ...catA,
            questionCount: catA.questionCount + 1,
            questionSlots: [
              ...catA.questionSlots,
              {
                questionNumber: catA.questionCount + 1,
                pageRange: { startPage: 102, endPage: 120 },
              },
            ],
          },
        },
      },
      AT
    );

    const verdict = evaluateEditGuard({
      published,
      candidate: extended,
      categoriesInUse: new Set(["CAT_A"]),
      categoriesWithAssignments: noneInUse,
      evaluationDocumentCount: 0,
    });
    expect(verdict.kind).toBe("allow");
  });
});
