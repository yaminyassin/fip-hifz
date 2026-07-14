import { test, expect } from "@playwright/test";
import { seedAuthenticatedSession } from "./auth";

const EVENT_ID = "demo-2026";

test.describe("/participants", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page, { eventId: EVENT_ID });
    await page.goto(`/participants?event=${EVENT_ID}`);
  });

  test("renders seeded participants from Firestore", async ({ page }) => {
    // Participants render in per-schedule-group tables, so scope name
    // assertions to any <table> (not just the first) rather than the whole
    // page, which also contains the ranked-list ParticipantScoreVisualizations.
    const tables = page.locator("table");
    await expect(tables.first()).toBeVisible();

    await expect(tables.getByText("Ahmad Al-Hafiz")).toBeVisible();
    await expect(tables.getByText("Bilal Rahman")).toBeVisible();
  });

  test("entering a participant name in search reduces visible rows to the match", async ({
    page,
  }) => {
    const tables = page.locator("table");
    await expect(tables.getByText("Ahmad Al-Hafiz")).toBeVisible();
    await expect(tables.getByText("Bilal Rahman")).toBeVisible();

    const searchInput = page.getByPlaceholder("Search participants...");
    await searchInput.fill("Ahmad");

    await expect(tables.getByText("Ahmad Al-Hafiz")).toBeVisible();
    await expect(tables.getByText("Bilal Rahman")).not.toBeVisible();
    await expect(tables.getByText("Yusuf Karim")).not.toBeVisible();
  });
});
