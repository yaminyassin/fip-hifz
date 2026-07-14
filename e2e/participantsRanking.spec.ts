import { test, expect } from "@playwright/test";
import { seedAuthenticatedSession } from "./auth";

const EVENT_ID = "demo-2026";

/**
 * The greenfield "completed ranking fixture" smoke gate (design doc §4,
 * `useParticipants`/`ParticipantsTable` rows): the config-driven engine
 * output (weights, section cap, void rule, add/subtract question types,
 * additive `overall_bonus` adjustment) is live in the participants ranking
 * display, computed entirely by `scoreQuestion` -> `scoreJury` ->
 * `scoreParticipant` from the seeded V2 `evaluationScores` /
 * `juryEvaluationInputs` documents — and the ranking-eligibility sentinel
 * still excludes an unfinished participant.
 */
test.describe("/participants ranking (config-driven engine output)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page, { eventId: EVENT_ID });
    await page.goto(`/participants?event=${EVENT_ID}`);
  });

  test("a completed participant displays the engine-computed final score and outranks an unfinished one", async ({
    page,
  }) => {
    const tables = page.locator("table");
    await expect(tables.getByText("Zainab Haddad")).toBeVisible();
    await expect(tables.getByText("Ahmad Al-Hafiz")).toBeVisible();

    // participant-ranking-done (CAT_A): Q1 = 100 - (1*3 + 1*2) + (2*1) = 97,
    // Q2 = 100 -> juryBase = 98.5; overall_bonus adjustment = +2 (bonus=2,
    // weight 1, add, cap 5) -> juryFinal = clamp(98.5 + 2, 0, 110) = 100.5
    // -> single-jury finalScore = 100.50.
    const doneRow = page.locator("tr", { has: page.getByText("Zainab Haddad") });
    await expect(doneRow.getByText("100.50 pts")).toBeVisible();

    // participant-active: isDone false -> ranking-ineligible sentinel
    // (finalScore = -1), no displayed score.
    const activeRow = page.locator("tr", { has: page.getByText("Ahmad Al-Hafiz") });
    await expect(activeRow.getByText("pts")).toHaveCount(0);

    // Both share the "1" schedule group and render in one table, sorted by
    // finalScore descending by default: the completed, higher-scoring
    // participant (100.50) ranks above the ineligible one (sentinel -1,
    // sorted to the bottom).
    const scheduleGroupRows = page
      .locator("table")
      .filter({ has: page.getByText("Zainab Haddad") })
      .locator("tbody tr");
    const rowTexts = await scheduleGroupRows.allTextContents();
    const doneIndex = rowTexts.findIndex((t) => t.includes("Zainab Haddad"));
    const activeIndex = rowTexts.findIndex((t) => t.includes("Ahmad Al-Hafiz"));
    expect(doneIndex).toBeGreaterThanOrEqual(0);
    expect(activeIndex).toBeGreaterThanOrEqual(0);
    expect(doneIndex).toBeLessThan(activeIndex);

    // The completed participant's score details are enabled; the
    // unfinished one's are disabled (finalScore < 0 / not done).
    const doneDetailsButton = doneRow.getByRole("button", { name: /details/i });
    await expect(doneDetailsButton).toBeEnabled();
    const activeDetailsButton = activeRow.getByRole("button", { name: /details/i });
    await expect(activeDetailsButton).toBeDisabled();
  });

  test("score details dialog shows the per-section breakdown from config.questionTypes", async ({
    page,
  }) => {
    const doneRow = page.locator("tr", { has: page.getByText("Zainab Haddad") });
    await doneRow.getByRole("button", { name: /details/i }).click();

    // Section labels come straight from the config (hifdh/tajweed/presentation),
    // never a hardcoded legacy field list. Scope to the dialog itself to
    // disambiguate from the section labels that ALSO appear in the
    // always-visible ParticipantScoreVisualizations panel.
    const dialog = page.getByTestId("score-details-dialog");
    await expect(dialog.getByRole("heading", { name: "Zainab Haddad" })).toBeVisible();

    await expect(dialog.getByText("Hifdh (Memorisation)").first()).toBeVisible();
    await expect(dialog.getByText("Tajweed", { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText("Presentation").first()).toBeVisible();
    await expect(dialog.getByText("Overall Bonus").first()).toBeVisible();
  });
});
