import { test, expect } from "@playwright/test";
import { doc, writeBatch } from "firebase/firestore";
import { seedAuthenticatedSession } from "./auth";
import { getEmulatorFirestore } from "./firestoreTestClient";

const EVENT_ID = "lisbon-2025";

test.describe("/big-screen", () => {
  test("reflects an emulator-side active-participant change via onSnapshot, without reload", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page, { eventId: EVENT_ID });
    await page.goto(`/big-screen?event=${EVENT_ID}`);

    await expect(page.getByText("Ahmad Al-Hafiz")).toBeVisible();

    // Swap which participant is active directly in the emulator, simulating
    // an admin/jury action elsewhere in the app.
    const firestore = getEmulatorFirestore();
    const batch = writeBatch(firestore);
    batch.update(
      doc(
        firestore,
        "events",
        EVENT_ID,
        "participants",
        "participant-active"
      ),
      { isActive: false }
    );
    batch.update(
      doc(
        firestore,
        "events",
        EVENT_ID,
        "participants",
        "participant-inactive"
      ),
      { isActive: true }
    );
    await batch.commit();

    // The onSnapshot listener behind useActiveParticipant should update the
    // rendered participant without any navigation or manual refetch.
    await expect(page.getByText("Bilal Rahman")).toBeVisible();
    await expect(page.getByText("Ahmad Al-Hafiz")).not.toBeVisible();
  });
});
