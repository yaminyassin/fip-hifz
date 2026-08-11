import { test, expect } from "@playwright/test";
import { seedAuthenticatedSession } from "./auth";

/**
 * T1: an event-less scored route must never silently load the demo-2026 trial
 * event. With no ?event= param and no persisted selection it fails closed
 * ("No event selected"); with a persisted selection it restores that event
 * (persistent identity, the Phase 6 fix) and reflects it back into the URL.
 */
test.describe("Event identity: no silent demo-2026 fallback", () => {
  test("no ?event= and no persisted event fails closed, never falling back to a trial event", async ({
    page,
  }) => {
    await page.goto(`/participants`);

    await expect(page.getByTestId("evaluation-config-gate-no-event")).toBeVisible();
    // Never falls through to any event's scored content.
    await expect(page.locator("table")).toHaveCount(0);
    // The URL was not rewritten to a hardcoded event.
    expect(new URL(page.url()).searchParams.get("event")).toBeNull();
  });

  test("a persisted event is restored on an event-less route and reflected into the URL", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, { eventId: "demo-2026" });
    await page.addInitScript(() => {
      localStorage.setItem("fip-hifz.currentEvent", "demo-2026");
    });

    await page.goto(`/participants`);

    // Restored the operator's last event, not a hardcoded default: the gate is
    // neither "no event" nor "fail closed", and the real table renders.
    await expect(page.getByTestId("evaluation-config-gate-no-event")).toHaveCount(0);
    await expect(page.getByTestId("evaluation-config-gate-fail-closed")).toHaveCount(0);
    await expect(page.locator("table").first()).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("event"))
      .toBe("demo-2026");
  });

  test("the jury roster stays on the same route when there is no event", async ({
    page,
  }) => {
    // With no event selected, /jury renders the jury selector outside the
    // config gate. Searching remains a local interaction and must not change
    // the route or invent a fallback event.
    await page.goto(`/jury`);

    const search = page.getByRole("searchbox");
    await expect(search).toBeVisible();
    const urlBeforeSearch = page.url();

    await search.fill("Nazim");

    expect(page.url()).toBe(urlBeforeSearch);
    expect(new URL(page.url()).searchParams.get("event")).toBeNull();
  });
});
