import { afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import {
  EVENT_ID,
  clearData,
  db,
  seed,
  seedEvent,
  teardownTestEnv,
} from "./harness";

afterAll(teardownTestEnv);
beforeEach(clearData);

describe("path reachability", () => {
  it("allows listing /events — EventSelector's first screen depends on it", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(getDocs(collection(client, "events")));
  });

  it("denies every collection outside the known set", async () => {
    const client = await db();
    await assertFails(
      setDoc(doc(client, "someOtherCollection", "x"), { a: 1 })
    );
    await assertFails(getDoc(doc(client, "someOtherCollection", "x")));
    await assertFails(
      addDoc(collection(client, "events", EVENT_ID, "unknownSub"), { a: 1 })
    );
  });

  it("denies the retired legacy scoring collections in both directions", async () => {
    await seedEvent();
    await seed(async (d) => {
      await setDoc(doc(d, "events", EVENT_ID, "scores", "legacy-1"), {
        score: 96.25,
      });
      await setDoc(doc(d, "events", EVENT_ID, "overallBonuses", "legacy-1"), {
        bonus: 2,
      });
    });
    const client = await db();
    await assertFails(
      getDoc(doc(client, "events", EVENT_ID, "scores", "legacy-1"))
    );
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "scores", "legacy-1"), { score: 1 })
    );
    await assertFails(
      getDoc(doc(client, "events", EVENT_ID, "overallBonuses", "legacy-1"))
    );
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "overallBonuses", "legacy-1"), {
        bonus: 1,
      })
    );
  });

  it("denies the retired root quran collection", async () => {
    await seed(async (d) => {
      await setDoc(doc(d, "quran", "001_small"), { pageNumber: 1, page: "..." });
    });
    const client = await db();
    await assertFails(getDoc(doc(client, "quran", "001_small")));
    await assertFails(setDoc(doc(client, "quran", "001_small"), { page: "x" }));
  });

  it("denies deleting an event document — it would orphan every subcollection", async () => {
    await seedEvent();
    const client = await db();
    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(doc(client, "events", EVENT_ID)));
  });
});
