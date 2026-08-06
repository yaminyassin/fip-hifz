import { test, expect } from "@playwright/test";
import { seedAuthenticatedSession } from "./auth";

/**
 * Browser-level proof that an event with no valid evaluation config fails
 * closed VISIBLY in the running app (design doc §2, "Gating") — not just
 * that the pure `loadEvaluationConfig` function returns `failClosed` in
 * isolation (see evaluationConfigLoadingSeam.spec.ts for that). Every
 * scored route wraps itself in `<EvaluationConfigGate>`, which renders an
 * explicit error surface instead of the route's content, and never falls
 * through to a hardcoded default config or category.
 */
const UNCONFIGURED_EVENT_ID = "unconfigured-event";

test.describe("EvaluationConfigGate: an unconfigured event fails closed in the actual UI", () => {
  test("/participants renders the fail-closed error surface instead of the participants table", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, { eventId: UNCONFIGURED_EVENT_ID });
    await page.goto(`/participants?event=${UNCONFIGURED_EVENT_ID}`);

    const failClosedPanel = page.getByTestId("evaluation-config-gate-fail-closed");
    await expect(failClosedPanel).toBeVisible();
    await expect(failClosedPanel).toContainText(UNCONFIGURED_EVENT_ID);

    // The gate blocks the route's actual content — no participants table,
    // no export button, no score data ever renders for this event.
    await expect(page.locator("table")).toHaveCount(0);
  });

  test("/randomizer renders the fail-closed error surface instead of the randomizer content", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, { eventId: UNCONFIGURED_EVENT_ID });
    await page.goto(`/randomizer?event=${UNCONFIGURED_EVENT_ID}`);

    await expect(page.getByTestId("evaluation-config-gate-fail-closed")).toBeVisible();
    await expect(page.getByRole("button", { name: /start/i })).toHaveCount(0);
  });

  test("/big-screen renders the fail-closed error surface instead of the participant/Quran view", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, { eventId: UNCONFIGURED_EVENT_ID });
    await page.goto(`/big-screen?event=${UNCONFIGURED_EVENT_ID}`);

    await expect(page.getByTestId("evaluation-config-gate-fail-closed")).toBeVisible();
  });

  test("a configured event (demo-2026) does NOT show the fail-closed surface", async ({ page }) => {
    await seedAuthenticatedSession(page, { eventId: "demo-2026" });
    await page.goto(`/participants?event=demo-2026`);

    await expect(page.getByTestId("evaluation-config-gate-fail-closed")).toHaveCount(0);
    await expect(page.locator("table").first()).toBeVisible();
  });
});
