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
    ({ eventId, juryId, shouldSetJury }) => {
      sessionStorage.setItem("authenticatedEvents", JSON.stringify([eventId]));

      const juryStorageKey = `authenticatedJuryId:${eventId}`;
      if (shouldSetJury) {
        if (juryId) {
          sessionStorage.setItem(juryStorageKey, juryId);
        } else {
          sessionStorage.removeItem(juryStorageKey);
        }
      }
    },
    {
      eventId,
      juryId: juryId ?? null,
      shouldSetJury: juryId !== undefined,
    }
  );
}
