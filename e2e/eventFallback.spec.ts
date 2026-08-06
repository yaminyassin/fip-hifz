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

  test("the jury login form does not native-submit / reload when there is no event", async ({
    page,
  }) => {
    // With no event selected, /jury renders the login form OUTSIDE the config
    // gate. Submitting must be intercepted (preventDefault) even though the
    // no-event guard bails early, or the browser performs a native GET submit
    // and reloads the page, and the juror can never log in.
    await page.goto(`/jury`);

    const form = page.locator("form").first();
    await expect(form).toBeVisible();
    const urlBeforeSubmit = page.url();

    await form.evaluate((f: HTMLFormElement) => f.requestSubmit());
    await page.waitForTimeout(300);

    // A native submit would append query params and reload; preventDefault
    // keeps the URL exactly as it was.
    expect(page.url()).toBe(urlBeforeSubmit);
  });
});
