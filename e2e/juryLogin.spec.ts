import { expect, test } from "@playwright/test";

import { seedAuthenticatedSession } from "./auth";

const EVENT_ID = "demo-2026";

test("a juror searches one roster, confirms their name, and keeps the event-scoped session", async ({
  page,
}) => {
  await seedAuthenticatedSession(page, { eventId: EVENT_ID });
  await page.goto(`/jury?event=${EVENT_ID}`);

  await expect(page.getByRole("searchbox", { name: "Jury member" })).toBeVisible();
  await expect(page.getByText("Judge One", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Judge Two", { exact: true })).toHaveCount(1);

  await page.getByRole("searchbox", { name: "Jury member" }).fill("One");

  await expect(page.getByText("Judge One", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Judge Two", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Select Judge One" }).click();
  await expect(page.getByText("Continue as Judge One?")).toBeVisible();
  await page.getByRole("button", { name: "Continue to scoring" }).click();

  await expect(page.getByText("Ahmad Al-Hafiz")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (eventId) => sessionStorage.getItem(`authenticatedJuryId:${eventId}`),
        EVENT_ID
      )
    )
    .toBe("jury-one");

  await page.reload();

  await expect
    .poll(() =>
      page.evaluate(
        (eventId) => sessionStorage.getItem(`authenticatedJuryId:${eventId}`),
        EVENT_ID
      )
    )
    .toBe("jury-one");
  await expect(page.getByText("Ahmad Al-Hafiz")).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Jury member" })).toHaveCount(0);
});
