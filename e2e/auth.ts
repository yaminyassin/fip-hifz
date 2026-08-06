import type { Page } from "@playwright/test";

/**
 * Seeds deterministic sessionStorage authentication state before navigation.
 * Playwright storage-state files do not preserve sessionStorage, so this
 * must run via addInitScript before the page loads.
 */
export async function seedAuthenticatedSession(
  page: Page,
  { eventId, juryId }: { eventId: string; juryId?: string | null }
) {
  await page.addInitScript(
    ({ eventId, juryId }) => {
      sessionStorage.setItem("authenticatedEvents", JSON.stringify([eventId]));

      if (juryId) {
        sessionStorage.setItem("authenticatedJuryId", juryId);
      } else {
        sessionStorage.removeItem("authenticatedJuryId");
      }
    },
    { eventId, juryId: juryId ?? null }
  );
}
