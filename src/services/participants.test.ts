import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  query: vi.fn((collectionRef, ...constraints) => ({ collectionRef, constraints })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  where: vi.fn((field, operator, value) => ({ field, operator, value })),
  writeBatch: vi.fn(),
}));

vi.mock("@/main", () => ({ firestore: { name: "test-firestore" } }));
vi.mock("@/services/evaluationScores", () => ({
  EVALUATION_SCORES_COLLECTION: "evaluationScores",
  JURY_EVALUATION_INPUTS_COLLECTION: "juryEvaluationInputs",
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, path) => ({ path })),
  deleteDoc: vi.fn(),
  doc: vi.fn((collectionRef, id) => ({ path: `${collectionRef.path}/${id}` })),
  getDocs: mocks.getDocs,
  query: mocks.query,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  updateDoc: vi.fn(),
  where: mocks.where,
  writeBatch: mocks.writeBatch,
}));

import {
  createParticipant,
  deleteParticipant,
  updateParticipant,
} from "./participants";

const participant = {
  name: "Amina Rahman",
  age: 14,
  country: "Portugal",
  category: "CAT_A",
  school: "",
  scheduled: "S1",
  isDone: false,
  isActive: false,
  flag: "🇵🇹",
  parentsName: "",
  phoneNum: "",
  email: "",
  photo: "",
  assignedQuestions: [],
  activeQuestion: 0,
};

describe("participant writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocs.mockResolvedValue({ empty: true });
  });

  it("creates with transaction create-only semantics", async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({ exists: () => false }),
      set: vi.fn(),
    };
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await expect(createParticipant("demo-2026", participant)).resolves.toBe("amina_rahman");
    expect(transaction.get).toHaveBeenCalledOnce();
    expect(transaction.set).toHaveBeenCalledOnce();
  });

  it("allocates a suffixed ID when the base name is already taken", async () => {
    const setRefs: Array<{ path: string }> = [];
    const transaction = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ exists: () => true }) // amina_rahman taken
        .mockResolvedValueOnce({ exists: () => false }), // amina_rahman_1 free
      set: vi.fn((ref: { path: string }) => setRefs.push(ref)),
    };
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await expect(createParticipant("demo-2026", participant)).resolves.toBe("amina_rahman_1");
    expect(transaction.set).toHaveBeenCalledOnce();
    expect(setRefs[0].path).toContain("participants/amina_rahman_1");
  });

  it("cascade deletes evaluation scores and jury inputs with the participant", async () => {
    const scoreRef = { path: "events/demo-2026/evaluationScores/score-1" };
    const juryInputRef = { path: "events/demo-2026/juryEvaluationInputs/input-1" };
    const querySnapshot = (refs: Array<{ path: string }>) => ({
      docs: refs.map((ref) => ({ ref })),
    });
    const batch = {
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getDocs
      .mockResolvedValueOnce(querySnapshot([scoreRef]))
      .mockResolvedValueOnce(querySnapshot([juryInputRef]));
    mocks.writeBatch.mockReturnValue(batch);

    await deleteParticipant("demo-2026", "amina_rahman");

    expect(mocks.where).toHaveBeenCalledTimes(2);
    expect(mocks.where).toHaveBeenNthCalledWith(1, "participantId", "==", "amina_rahman");
    expect(mocks.where).toHaveBeenNthCalledWith(2, "participantId", "==", "amina_rahman");
    expect(batch.delete).toHaveBeenCalledWith(scoreRef);
    expect(batch.delete).toHaveBeenCalledWith(juryInputRef);
    expect(batch.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining("participants/amina_rahman") })
    );
    expect(batch.commit).toHaveBeenCalledOnce();
  });

  it("blocks category changes from the transactionally maintained evaluation sentinel", async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ ...participant, evaluationStarted: true }),
      }),
      update: vi.fn(),
    };
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await expect(
      updateParticipant("demo-2026", "amina_rahman", { ...participant, category: "CAT_M" })
    ).rejects.toThrow("Category cannot be changed");
    expect(transaction.update).not.toHaveBeenCalled();
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });

  it("blocks category changes after assignment or evaluation progress", async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ ...participant, assignedQuestions: [10, 20] }),
      }),
      update: vi.fn(),
    };
    mocks.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    await expect(
      updateParticipant("demo-2026", "amina_rahman", { ...participant, category: "CAT_M" })
    ).rejects.toThrow("Category cannot be changed");
    expect(transaction.update).not.toHaveBeenCalled();
  });
});
