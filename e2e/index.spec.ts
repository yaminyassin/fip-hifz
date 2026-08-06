import { test, expect } from "@playwright/test";
import { seedAuthenticatedSession } from "./auth";

const EVENT_ID = "demo-2026";

test.describe("/", () => {
  test("selecting a routed menu tile navigates to its destination and preserves the event param", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, { eventId: EVENT_ID });

    await page.goto(`/?event=${EVENT_ID}`);

    // Authenticated boot path renders the bento navigation menu instead of
    // the event-selection card.
    const participantsTile = page.getByText("Participants", { exact: true });
    await expect(participantsTile).toBeVisible();

    await participantsTile.click();

    await expect(page).toHaveURL(
      new RegExp(`/participants\\?event=${EVENT_ID}$`)
    );
  });
});
