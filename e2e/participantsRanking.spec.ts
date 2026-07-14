import { test, expect } from "@playwright/test";
import { seedAuthenticatedSession } from "./auth";

const EVENT_ID = "lisbon-2025";

/**
 * The Lisbon "completed ranking fixture" smoke gate (design section 5,
 * "Completed ranking fixture" + "Exact smoke gates" #8): the Phase 1a
 * additive-bonus delta is live in the participants ranking display, and the
 * ranking-eligibility sentinel still excludes an unfinished participant.
 */
test.describe("/participants ranking (Phase 1a additive Lisbon bonus)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page, { eventId: EVENT_ID });
    await page.goto(`/participants?event=${EVENT_ID}`);
  });

  test("a completed participant displays the additive final score and outranks an unfinished one", async ({
    page,
  }) => {
    const tables = page.locator("table");
    await expect(tables.getByText("Zainab Haddad")).toBeVisible();
    await expect(tables.getByText("Ahmad Al-Hafiz")).toBeVisible();

    // participant-ranking-done: isDone true, legacy base 98.5 + additive
    // bonus 2, clamped to [0, 105] -> displayed final 100.50.
    const doneRow = page.locator("tr", { has: page.getByText("Zainab Haddad") });
    await expect(doneRow.getByText("100.50 pts")).toBeVisible();

    // participant-active: isDone false -> ranking-ineligible sentinel
    // (finalScore = -1), no displayed score, despite an identical
    // diagnostic base/bonus to the completed fixture above.
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
});
