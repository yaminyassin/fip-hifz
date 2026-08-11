import { expect, test } from "@playwright/test";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { seedAuthenticatedSession } from "./auth";
import { getEmulatorFirestore } from "./firestoreTestClient";

const EVENT_ID = "demo-2026";
const JURY_ID = "jury-one";

async function juryIsActive(): Promise<boolean | undefined> {
  const snapshot = await getDoc(juryDocument());
  const isActive = snapshot.data()?.isActive;
  return typeof isActive === "boolean" ? isActive : undefined;
}

function juryDocument() {
  return doc(getEmulatorFirestore(), "events", EVENT_ID, "jury", JURY_ID);
}

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
  await expect.poll(juryIsActive).toBe(true);
});

test("closing an authenticated jury page deactivates that jury", async ({
  page,
}) => {
  await updateDoc(juryDocument(), { isActive: true });
  await seedAuthenticatedSession(page, { eventId: EVENT_ID, juryId: JURY_ID });
  await page.goto(`/jury?event=${EVENT_ID}`);

  await expect(page.getByText("Ahmad Al-Hafiz")).toBeVisible();
  await expect.poll(juryIsActive).toBe(true);

  await page.close();

  await expect.poll(juryIsActive).toBe(false);
});
