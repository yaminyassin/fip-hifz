import { test, expect } from "@playwright/test";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { seedAuthenticatedSession } from "./auth";
import { getEmulatorFirestore } from "./firestoreTestClient";

const EVENT_ID = "demo-2026";
const JURY_ID = "jury-three";
const PARTICIPANT_ID = "participant-active"; // Ahmad Al-Hafiz, category CAT_A, pages [27, 76]

/**
 * End-to-end proof that the jury flow is entirely config-driven (design doc
 * §4, "Consumer wiring"): the question tabs come from
 * `config.categories.CAT_A.questionCount`, the input sections come from
 * `config.questionTypes` (in `order`), the void-warning highlight comes
 * from `config.overrideRules`, and completing an evaluation writes real
 * `EvaluationScoreV2`/`JuryEvaluationInputsV2` documents that the committed
 * engine can score.
 */
test.describe("/jury: config-driven evaluation flow (demo-2026, CAT_A)", () => {
  test.beforeEach(async ({ page }) => {
    // Other spec files (e.g. big-screen.spec.ts) mutate which participant is
    // active against this same shared emulator database. Pin the active
    // participant back to participant-active (Ahmad Al-Hafiz, CAT_A) so this
    // suite is deterministic regardless of file execution order.
    const firestore = getEmulatorFirestore();
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, "events", EVENT_ID, "participants", "participant-active"), {
      isActive: true,
    });
    batch.update(doc(firestore, "events", EVENT_ID, "participants", "participant-inactive"), {
      isActive: false,
    });
    await batch.commit();

    await seedAuthenticatedSession(page, { eventId: EVENT_ID, juryId: JURY_ID });
    await page.goto(`/jury?event=${EVENT_ID}`);
  });

  test("renders question tabs and input sections entirely from the event's config", async ({
    page,
  }) => {
    await expect(page.getByText("Ahmad Al-Hafiz")).toBeVisible();

    // Tab count = config.categories.CAT_A.questionCount (2), with pages
    // straight from participant.assignedQuestions — never a hardcoded
    // category shape.
    await expect(page.getByText("Q1")).toBeVisible();
    await expect(page.getByText("Page 27")).toBeVisible();
    await expect(page.getByText("Q2")).toBeVisible();
    await expect(page.getByText("Page 76")).toBeVisible();

    // Section labels come straight from config.questionTypes (ordered),
    // never a hardcoded hifdh/tajweed/bonus block.
    await expect(page.getByText("Hifdh (Memorisation)")).toBeVisible();
    await expect(page.getByText("Tajweed", { exact: true })).toBeVisible();
    await expect(page.getByText("Presentation")).toBeVisible();
    await expect(page.getByText("Judge Correction")).toBeVisible();
    await expect(page.getByText("Self Correction")).toBeVisible();
    await expect(page.getByText("Fluency", { exact: true })).toBeVisible();

    // The participant-level adjustment (overall bonus) comes from
    // config.participantAdjustments.
    await expect(page.getByText("Overall Bonus").first()).toBeVisible();
  });

  test("the void-warning highlight fires generically from config.overrideRules, not a hardcoded threshold", async ({
    page,
  }) => {
    const firestore = getEmulatorFirestore();
    const judgeCorrectionIncrease = page.getByRole("button", {
      name: "Judge Correction Increase score",
    });

    // hifdh.judge_correction gte 3 -> voidQuestion (the example config's
    // one override rule). No warning below the threshold...
    await judgeCorrectionIncrease.click();
    await judgeCorrectionIncrease.click();
    await expect(
      page.getByText(/this question will be voided/i)
    ).toHaveCount(0);

    // ...and the warning appears once the rule's condition is met.
    await judgeCorrectionIncrease.click();
    await expect(page.getByText(/this question will be voided/i)).toBeVisible();

    // Wait for the debounced save to land before the test (and page) tears
    // down, so no async write is left racing the next test.
    await expect
      .poll(async () => {
        const snap = await getDoc(
          doc(firestore, "events", EVENT_ID, "evaluationScores", `${PARTICIPANT_ID}_${JURY_ID}_1`)
        );
        return snap.exists() ? snap.data()?.values?.hifdh?.judge_correction : undefined;
      })
      .toBe(3);
  });

  test("an edit made just before a tab switch is flushed, not dropped by the debounce", async ({
    page,
  }) => {
    const firestore = getEmulatorFirestore();

    // Edit Q1, then immediately switch to Q2 -- well inside the 500ms
    // debounce window, before the scheduled save would have fired on its
    // own. handleQuestionChange must flush the pending save (not just
    // clearTimeout it) before the tab switch takes effect.
    const fluencyIncrease = page.getByRole("button", { name: "Fluency Increase score" });
    await fluencyIncrease.click();
    await page.getByText("Q2").click();
    await expect(page.getByText("Page 76")).toBeVisible();

    // The Q1 edit must still land in Firestore even though the tab switch
    // happened before the debounce timer would have fired.
    await expect
      .poll(async () => {
        const snap = await getDoc(
          doc(firestore, "events", EVENT_ID, "evaluationScores", `${PARTICIPANT_ID}_${JURY_ID}_1`)
        );
        return snap.exists() ? snap.data()?.values?.presentation?.fluency : undefined;
      })
      .toBe(1);

    // Switching back to Q1 must show the flushed value (1), not a stale
    // pre-edit default (0) -- proving allScores was updated (not
    // clobbered) by the time ScoreForm reloads the question.
    await page.getByText("Q1").click();
    await expect(page.getByText("Page 27")).toBeVisible();
    await expect(page.getByTestId("score-input-Fluency")).toContainText("1");

    // Restore Q1's fluency back to its default (0) and let that save land,
    // so this test leaves no residual score state for the tests below,
    // which assume a clean slate for this participant/jury.
    await page.getByRole("button", { name: "Fluency Decrease score" }).click();
    await expect
      .poll(async () => {
        const snap = await getDoc(
          doc(firestore, "events", EVENT_ID, "evaluationScores", `${PARTICIPANT_ID}_${JURY_ID}_1`)
        );
        return snap.exists() ? snap.data()?.values?.presentation?.fluency : undefined;
      })
      .toBe(0);
  });

  test("completing both questions writes valid V2 evaluationScores + juryEvaluationInputs documents", async ({
    page,
  }) => {
    const firestore = getEmulatorFirestore();

    // Q1 (page 27): give it a small presentation bonus (fluency = 1).
    const fluencyIncrease = page.getByRole("button", { name: "Fluency Increase score" });
    await fluencyIncrease.click();

    await expect
      .poll(async () => {
        const snap = await getDoc(
          doc(firestore, "events", EVENT_ID, "evaluationScores", `${PARTICIPANT_ID}_${JURY_ID}_1`)
        );
        return snap.exists() ? snap.data()?.values?.presentation?.fluency : undefined;
      })
      .toBe(1);

    // Move to Q2 (page 76) and leave it at defaults (all zero).
    await page.getByText("Q2").click();
    await expect(page.getByText("Page 76")).toBeVisible();

    // Finish the evaluation.
    await page.getByRole("button", { name: /finish/i }).click();
    await expect(page.getByRole("button", { name: /completed/i })).toBeVisible();

    // Q1 doc: score = 100 (base) + 1*1 (fluency weight 1, add) = 101.
    const q1 = await getDoc(
      doc(firestore, "events", EVENT_ID, "evaluationScores", `${PARTICIPANT_ID}_${JURY_ID}_1`)
    );
    expect(q1.exists()).toBe(true);
    expect(q1.data()?.categoryId).toBe("CAT_A");
    expect(q1.data()?.pageNumber).toBe(27);
    expect(q1.data()?.values.presentation.fluency).toBe(1);

    // Q2 doc: written when Finish saved the current (Q2) question at its
    // all-zero default.
    const q2 = await getDoc(
      doc(firestore, "events", EVENT_ID, "evaluationScores", `${PARTICIPANT_ID}_${JURY_ID}_2`)
    );
    expect(q2.exists()).toBe(true);
    expect(q2.data()?.pageNumber).toBe(76);

    // The participant-level adjustment doc (overall bonus) is written too,
    // even at its default (0) value.
    const adjustments = await getDoc(
      doc(firestore, "events", EVENT_ID, "juryEvaluationInputs", `${PARTICIPANT_ID}_${JURY_ID}`)
    );
    expect(adjustments.exists()).toBe(true);
    expect(adjustments.data()?.values.overall_bonus.bonus).toBe(0);

    // Jury progress reflects completion.
    const juryDoc = await getDoc(doc(firestore, "events", EVENT_ID, "jury", JURY_ID));
    expect(juryDoc.data()?.hasFinishedEvaluating).toBe(true);
  });
});
