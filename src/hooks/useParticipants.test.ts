// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const eventContext = vi.hoisted(() => ({
  currentEvent: "event-one" as string | null,
  evaluationConfig: null as unknown,
}));

const firestoreHarness = vi.hoisted(() => ({
  listeners: [] as Array<{
    next: (snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => void;
    error: (error: Error) => void;
  }>,
}));

vi.mock("@/main", () => ({ firestore: {} }));
vi.mock("@/contexts/EventContext", () => ({
  useEvent: () => eventContext,
}));
vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<typeof import("firebase/firestore")>(
    "firebase/firestore"
  );
  return {
    ...actual,
    collection: vi.fn((_firestore, path: string) => ({ path })),
    query: vi.fn((reference) => reference),
    onSnapshot: vi.fn((_reference, next, error) => {
      firestoreHarness.listeners.push({ next, error });
      return vi.fn();
    }),
  };
});

import { Timestamp } from "firebase/firestore";
import {
  buildDefaultAdjustmentValues,
  computeAssignmentHash,
} from "@/evaluation/configHelpers";
import { buildTrialWeightedConfig } from "@/evaluation/__tests__/fixtures";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";
import type { Participant } from "@/models/models";
import {
  computeParticipantScoring,
  useParticipants,
  useParticipantsListenerError,
  type ParticipantWithScores,
  type RawEvaluationScoreDoc,
  type RawJuryEvaluationInputsDoc,
} from "./useParticipants";

const participant: Participant = {
  id: "participant-one",
  name: "Participant One",
  age: 14,
  country: "Portugal",
  category: "S",
  school: "",
  scheduled: "S1",
  isDone: true,
  isActive: false,
  flag: "🇵🇹",
  parentsName: "",
  phoneNum: "",
  email: "",
  assignedQuestions: [10, 20],
  activeQuestion: 0,
};

function zeroQuestionValues() {
  return {
    accuracy: { x: 0, y: 0 },
    delivery: { z: 0 },
  };
}

async function scoreFixture(
  config: EventEvaluationConfigV2,
  questionNumber: number,
  overrides: Partial<RawEvaluationScoreDoc> = {}
): Promise<RawEvaluationScoreDoc> {
  const assignmentHash = await computeAssignmentHash(
    participant.id,
    participant.category,
    participant.assignedQuestions
  );
  return {
    schemaVersion: 2,
    participantId: participant.id,
    juryId: "jury-one",
    questionNumber,
    pageNumber: participant.assignedQuestions[questionNumber - 1],
    categoryId: participant.category,
    configVersion: config.configVersion,
    scoringFingerprint: config.scoringFingerprint,
    algorithmVersion: config.algorithmVersion,
    assignmentHash,
    values: zeroQuestionValues(),
    source: { kind: "nativeV2" },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

async function adjustmentFixture(
  config: EventEvaluationConfigV2,
  overrides: Partial<RawJuryEvaluationInputsDoc> = {}
): Promise<RawJuryEvaluationInputsDoc> {
  const assignmentHash = await computeAssignmentHash(
    participant.id,
    participant.category,
    participant.assignedQuestions
  );
  return {
    schemaVersion: 2,
    participantId: participant.id,
    juryId: "jury-one",
    categoryId: participant.category,
    configVersion: config.configVersion,
    scoringFingerprint: config.scoringFingerprint,
    algorithmVersion: config.algorithmVersion,
    assignmentHash,
    values: buildDefaultAdjustmentValues(config),
    source: { kind: "nativeV2" },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

describe("computeParticipantScoring provenance", () => {
  it("ignores scores from a previous category or assignment", async () => {
    const config = buildTrialWeightedConfig();
    const mismatchedScores: RawEvaluationScoreDoc[] = [
      await scoreFixture(config, 1, { categoryId: "OLD_CATEGORY" }),
      await scoreFixture(config, 2, { assignmentHash: "old-assignment" }),
    ];

    const result = await computeParticipantScoring(
      participant,
      mismatchedScores,
      [],
      config
    );
    expect(result.finalScore).toBe(-1);
    expect(result.juryIds).toEqual([]);
    expect(result.scoringError).toBeUndefined();
  });

  it("accepts a complete jury only when every score has current provenance", async () => {
    const config = buildTrialWeightedConfig();
    const result = await computeParticipantScoring(
      participant,
      [await scoreFixture(config, 1), await scoreFixture(config, 2)],
      [],
      config
    );
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.juryIds).toEqual(["jury-one"]);
  });

  it("omits an incomplete jury but still scores the complete one", async () => {
    const config = buildTrialWeightedConfig();
    const result = await computeParticipantScoring(
      participant,
      [
        // jury-one: complete (both assigned questions)
        await scoreFixture(config, 1, { juryId: "jury-one" }),
        await scoreFixture(config, 2, { juryId: "jury-one" }),
        // jury-two: incomplete (missing question 2) -> omitted, not fatal
        await scoreFixture(config, 1, { juryId: "jury-two" }),
      ],
      [],
      config
    );
    expect(result.scoringError).toBeUndefined();
    expect(result.juryIds).toEqual(["jury-one"]);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it("fails closed on a complete jury whose values are out of range", async () => {
    const config = buildTrialWeightedConfig();
    // Both questions present (complete), but accuracy.x = 999 exceeds its max
    // of 10 -> semantically invalid, must NOT be silently skipped.
    const result = await computeParticipantScoring(
      participant,
      [
        await scoreFixture(config, 1, {
          values: { accuracy: { x: 999, y: 0 }, delivery: { z: 0 } },
        }),
        await scoreFixture(config, 2),
      ],
      [],
      config
    );
    expect(result.finalScore).toBe(-1);
    expect(result.scoringError).toContain('invalid evaluation for jury "jury-one"');
  });

  it("rejects a malformed boundary document instead of scoring it", async () => {
    const config = buildTrialWeightedConfig();
    const malformed = {
      ...await scoreFixture(config, 1),
      schemaVersion: 1,
    };

    const result = await computeParticipantScoring(
      participant,
      [malformed, await scoreFixture(config, 2)],
      [],
      config
    );
    expect(result.finalScore).toBe(-1);
    expect(result.juryIds).toEqual([]);
    expect(result.scoringError).toContain("schemaVersion must be 2");
  });

  it("rejects fields outside the exact V2 score boundary", async () => {
    const config = buildTrialWeightedConfig();
    const result = await computeParticipantScoring(
      participant,
      [{ ...await scoreFixture(config, 1), legacyScore: 100 }, await scoreFixture(config, 2)],
      [],
      config
    );
    expect(result.finalScore).toBe(-1);
    expect(result.scoringError).toContain("fields do not match the V2 boundary");
  });

  it("rejects a current score whose page does not match the assigned question", async () => {
    const config = buildTrialWeightedConfig();
    const result = await computeParticipantScoring(
      participant,
      [
        await scoreFixture(config, 1, { pageNumber: 999 }),
        await scoreFixture(config, 2),
      ],
      [],
      config
    );
    expect(result.finalScore).toBe(-1);
    expect(result.scoringError).toContain("does not match assigned page");
  });

  it("blocks a duplicate score logical key", async () => {
    const config = buildTrialWeightedConfig();
    const firstQuestion = await scoreFixture(config, 1);
    const result = await computeParticipantScoring(
      participant,
      [firstQuestion, { ...firstQuestion }, await scoreFixture(config, 2)],
      [],
      config
    );
    expect(result.finalScore).toBe(-1);
    expect(result.juryIds).toEqual([]);
    expect(result.scoringError).toContain("duplicate evaluation score documents");
  });

  it("blocks a duplicate adjustment logical key", async () => {
    const config = buildTrialWeightedConfig();
    const adjustment = await adjustmentFixture(config);
    const result = await computeParticipantScoring(
      participant,
      [await scoreFixture(config, 1), await scoreFixture(config, 2)],
      [adjustment, { ...adjustment }],
      config
    );
    expect(result.finalScore).toBe(-1);
    expect(result.juryIds).toEqual([]);
    expect(result.scoringError).toContain("duplicate jury evaluation input documents");
  });
});

function snapshotDocument(id: string, data: unknown) {
  return { id, data: () => data };
}

function participantDocumentData(value: Participant) {
  const data: Partial<Participant> = { ...value };
  delete data.id;
  return data;
}

describe("useParticipants event generation", () => {
  beforeEach(() => {
    firestoreHarness.listeners.length = 0;
    eventContext.currentEvent = "event-one";
    eventContext.evaluationConfig = buildTrialWeightedConfig();
  });

  it("does not publish stale event work over a new event scoring error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { rerender, unmount } = renderHook(() => useParticipants(), { wrapper });
    expect(firestoreHarness.listeners).toHaveLength(3);

    act(() => {
      firestoreHarness.listeners[0].next({
        docs: [snapshotDocument(participant.id, participantDocumentData(participant))],
      });
    });

    eventContext.currentEvent = "event-two";
    rerender();
    expect(firestoreHarness.listeners).toHaveLength(6);

    const eventTwoParticipant = { ...participant, id: "participant-two" };
    act(() => {
      firestoreHarness.listeners[3].next({
        docs: [
          snapshotDocument(
            eventTwoParticipant.id,
            participantDocumentData(eventTwoParticipant)
          ),
        ],
      });
      firestoreHarness.listeners[4].next({
        docs: [
          snapshotDocument("malformed-score", {
            participantId: eventTwoParticipant.id,
            schemaVersion: 1,
          }),
        ],
      });
      // The adjustments listener must also deliver before any ranking publishes.
      firestoreHarness.listeners[5].next({ docs: [] });
    });

    await waitFor(() => {
      const current = queryClient.getQueryData<ParticipantWithScores[]>([
        "participants",
        "event-two",
      ]);
      expect(current?.[0].id).toBe(eventTwoParticipant.id);
      expect(current?.[0].finalScore).toBe(-1);
      expect(current?.[0].scoringError).toContain("invalid evaluation score document");
    });

    await act(async () => {
      await Promise.resolve();
    });
    const oldEvent = queryClient.getQueryData<ParticipantWithScores[]>([
      "participants",
      "event-one",
    ]);
    expect(oldEvent ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: participant.id })])
    );

    unmount();
  });
});

describe("useParticipants listener error surfacing", () => {
  beforeEach(() => {
    firestoreHarness.listeners.length = 0;
    eventContext.currentEvent = "event-one";
    eventContext.evaluationConfig = buildTrialWeightedConfig();
  });

  it("exposes a Firestore listener error and clears it for a fresh event", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result, rerender, unmount } = renderHook(
      () => ({
        participants: useParticipants(),
        error: useParticipantsListenerError(),
      }),
      { wrapper }
    );
    expect(firestoreHarness.listeners).toHaveLength(3);
    expect(result.current.error).toBeNull();

    // A terminal onSnapshot error surfaces its message.
    act(() => {
      firestoreHarness.listeners[1].error(new Error("permission-denied"));
    });
    await waitFor(() => {
      expect(result.current.error).toBe("permission-denied");
    });

    // Switching events re-establishes fresh listeners and clears the error.
    eventContext.currentEvent = "event-two";
    rerender();
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });

    unmount();
  });
});
