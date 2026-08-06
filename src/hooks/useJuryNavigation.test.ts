import { describe, expect, it, vi } from "vitest";

// `useJuryNavigation` pulls in `@/services/jury`, which imports the real
// Firebase app from `@/main`. `findUnscoredQuestions` itself is pure, so the
// module is stubbed exactly as in useParticipants.test.ts.
vi.mock("@/main", () => ({ firestore: {} }));

import { findUnscoredQuestions } from "./useJuryNavigation";
import type { QuestionValueMap } from "@/evaluation/scoringEngine";

/** A question the juror scored, but scored as all zeros. */
const allZeros: QuestionValueMap = {
  accuracy: { x: 0, y: 0 },
  delivery: { z: 0 },
};

const scored: QuestionValueMap = {
  accuracy: { x: 3, y: 1 },
  delivery: { z: 2 },
};

/**
 * This function decides whether a jury may be marked finished, and a jury that
 * concludes with a gap is silently dropped from the participant's average by
 * useParticipants (`if (!hasEveryQuestion) continue;`). A false "nothing
 * missing" therefore corrupts the ranking with no error anywhere, so each
 * branch is pinned here.
 */
describe("findUnscoredQuestions", () => {
  it("reports nothing when every question in the category has a score", () => {
    expect(findUnscoredQuestions(3, { 1: scored, 2: scored, 3: scored })).toEqual([]);
  });

  it("counts an all-zero score as SCORED", () => {
    // A juror who deliberately awards zero has a real, stored score. Judging
    // by the values instead of by presence would refuse to let them finish.
    expect(findUnscoredQuestions(3, { 1: allZeros, 2: allZeros, 3: allZeros })).toEqual([]);
  });

  it("reports a question that has no entry at all", () => {
    expect(findUnscoredQuestions(3, { 1: scored, 3: scored })).toEqual([2]);
  });

  it("reports every gap, in ascending question order", () => {
    expect(findUnscoredQuestions(4, { 2: scored })).toEqual([1, 3, 4]);
  });

  it("reports all questions when nothing has been scored", () => {
    expect(findUnscoredQuestions(3, {})).toEqual([1, 2, 3]);
  });

  it("honours `alsoScored` for the question just saved but not yet in the snapshot", () => {
    // `allScores` is the render-time snapshot, so the question Finish saves a
    // moment earlier is still absent from it. Without this argument, finishing
    // on the last unscored question would always be refused.
    expect(findUnscoredQuestions(3, { 1: scored, 2: scored }, [3])).toEqual([]);
  });

  it("does not let `alsoScored` paper over a different gap", () => {
    expect(findUnscoredQuestions(3, { 1: scored }, [3])).toEqual([2]);
  });

  it("ignores `alsoScored` entries outside the category's question range", () => {
    expect(findUnscoredQuestions(2, {}, [5])).toEqual([1, 2]);
  });

  it("treats an explicitly null or undefined entry as missing", () => {
    // A key with no document behind it is not a score. Object.entries would
    // otherwise mark question 2 as present purely because the key exists.
    expect(
      findUnscoredQuestions(2, { 1: scored, 2: undefined } as Record<number, unknown>)
    ).toEqual([2]);
    expect(
      findUnscoredQuestions(2, { 1: scored, 2: null } as Record<number, unknown>)
    ).toEqual([2]);
  });

  it("uses the category's question count, not the number of stored scores", () => {
    // The randomizer writes `assignedQuestions` one element at a time, so a
    // partially-written assignment must never shrink what "complete" means.
    expect(findUnscoredQuestions(5, { 1: scored, 2: scored })).toEqual([3, 4, 5]);
  });

  it("reports nothing for a category with no questions", () => {
    expect(findUnscoredQuestions(0, {})).toEqual([]);
  });

  it("ignores non-numeric keys", () => {
    expect(
      findUnscoredQuestions(1, { 1: scored, notAQuestion: scored } as Record<
        string,
        unknown
      >)
    ).toEqual([]);
  });
});
