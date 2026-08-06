import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  validateQuestionValues: vi.fn(() => ({ ok: true, errors: [] })),
  validateAdjustmentValues: vi.fn(() => ({ ok: true, errors: [] })),
  computeAssignmentHash: vi.fn(async () => "assignment-hash"),
}));

vi.mock("@/main", () => ({ firestore: { name: "default-firestore" } }));
vi.mock("@/evaluation/scoringEngine", () => ({
  validateQuestionValues: mocks.validateQuestionValues,
  validateAdjustmentValues: mocks.validateAdjustmentValues,
}));
vi.mock("@/evaluation/configHelpers", () => ({
  computeAssignmentHash: mocks.computeAssignmentHash,
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, path) => ({ path })),
  deleteDoc: vi.fn(),
  doc: vi.fn((collectionRef, id) => ({ path: `${collectionRef.path}/${id}` })),
  getDocs: vi.fn(),
  query: vi.fn(),
  runTransaction: mocks.runTransaction,
  Timestamp: { now: vi.fn(() => "now") },
  where: vi.fn(),
}));

import {
  evaluationScoreDocId,
  juryEvaluationInputsDocId,
  saveEvaluationScore,
  saveJuryEvaluationInputs,
} from "./evaluationScores";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";

const config = {
  configVersion: "v1",
  scoringFingerprint: "fingerprint",
  algorithmVersion: "jury-first-v2",
} as EventEvaluationConfigV2;

function transactionFor(
  category = "CAT_A",
  assignedQuestions: readonly number[] = [27]
) {
  return {
    get: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({ category, assignedQuestions }),
    }),
    set: vi.fn(),
    update: vi.fn(),
  };
}

describe("evaluation writes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes a score and marks evaluation started in the same transaction", async () => {
    const transaction = transactionFor();
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await saveEvaluationScore({
      eventId: "demo-2026",
      participantId: "amina_rahman",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 27,
      categoryId: "CAT_A",
      config,
      values: {},
      assignedQuestions: [27],
    });

    expect(transaction.get).toHaveBeenCalledWith(
      expect.objectContaining({ path: "events/demo-2026/participants/amina_rahman" })
    );
    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("events/demo-2026/evaluationScores/"),
      }),
      expect.objectContaining({
        categoryId: "CAT_A",
        participantId: "amina_rahman",
        juryId: "jury-one",
        questionNumber: 1,
      }),
      { merge: true }
    );
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "events/demo-2026/participants/amina_rahman" }),
      { evaluationStarted: true }
    );
  });

  it("writes jury inputs through the same participant sentinel transaction", async () => {
    const transaction = transactionFor();
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await saveJuryEvaluationInputs({
      eventId: "demo-2026",
      participantId: "amina_rahman",
      juryId: "jury-one",
      categoryId: "CAT_A",
      config,
      values: {},
      assignedQuestions: [27],
    });

    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("events/demo-2026/juryEvaluationInputs/"),
      }),
      expect.any(Object),
      { merge: true }
    );
    expect(transaction.update).toHaveBeenCalledWith(
      expect.any(Object),
      { evaluationStarted: true }
    );
  });

  it("rejects a stale evaluation write after the participant category changes", async () => {
    const transaction = transactionFor("CAT_M");
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await expect(saveEvaluationScore({
      eventId: "demo-2026",
      participantId: "amina_rahman",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 27,
      categoryId: "CAT_A",
      config,
      values: {},
      assignedQuestions: [27],
    })).rejects.toThrow("category changed");
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("rejects stale score and jury-input writes after questions are reassigned", async () => {
    const scoreTransaction = transactionFor("CAT_A", [99]);
    mocks.runTransaction.mockImplementationOnce(
      async (_db, callback) => callback(scoreTransaction)
    );

    await expect(saveEvaluationScore({
      eventId: "demo-2026",
      participantId: "amina_rahman",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 27,
      categoryId: "CAT_A",
      config,
      values: {},
      assignedQuestions: [27],
    })).rejects.toThrow("assigned questions changed");
    expect(scoreTransaction.set).not.toHaveBeenCalled();

    const inputsTransaction = transactionFor("CAT_A", [99]);
    mocks.runTransaction.mockImplementationOnce(
      async (_db, callback) => callback(inputsTransaction)
    );
    await expect(saveJuryEvaluationInputs({
      eventId: "demo-2026",
      participantId: "amina_rahman",
      juryId: "jury-one",
      categoryId: "CAT_A",
      config,
      values: {},
      assignedQuestions: [27],
    })).rejects.toThrow("assigned questions changed");
    expect(inputsTransaction.set).not.toHaveBeenCalled();
  });

  it("rejects a score whose page does not match its question number", async () => {
    const transaction = transactionFor("CAT_A", [27]);
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await expect(saveEvaluationScore({
      eventId: "demo-2026",
      participantId: "amina_rahman",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 28,
      categoryId: "CAT_A",
      config,
      values: {},
      assignedQuestions: [27],
    })).rejects.toThrow("question page changed");
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("derives collision-free, bounded document ids from the full logical key", async () => {
    // Raw concatenation would map ("a_b","c",1) and ("a","b_c",1) to "a_b_c_1".
    const first = await evaluationScoreDocId("a_b", "c", 1);
    const second = await evaluationScoreDocId("a", "b_c", 1);
    expect(first).not.toBe(second);

    const longId = await juryEvaluationInputsDocId("p".repeat(4000), "j".repeat(4000));
    expect(longId.length).toBeLessThanOrEqual(64);
  });

  it("preserves createdAt on re-save and only advances updatedAt", async () => {
    let evaluationExists = false;
    const transaction = {
      get: vi.fn().mockImplementation((ref: { path: string }) =>
        Promise.resolve(
          ref.path.includes("/participants/")
            ? { exists: (): boolean => true, data: () => ({ category: "CAT_A", assignedQuestions: [27] }) }
            : { exists: (): boolean => evaluationExists }
        )
      ),
      set: vi.fn(),
      update: vi.fn(),
    };
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    const params = {
      eventId: "demo-2026",
      participantId: "amina_rahman",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 27,
      categoryId: "CAT_A",
      config,
      values: {},
      assignedQuestions: [27],
    };

    await saveEvaluationScore(params);
    const firstWrite = transaction.set.mock.calls[0][1];
    expect(firstWrite).toHaveProperty("createdAt");
    expect(firstWrite).toHaveProperty("updatedAt");

    evaluationExists = true;
    await saveEvaluationScore(params);
    const secondWrite = transaction.set.mock.calls[1][1];
    expect(secondWrite).not.toHaveProperty("createdAt");
    expect(secondWrite).toHaveProperty("updatedAt");
  });
});
