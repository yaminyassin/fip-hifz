import { afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc, updateDoc } from "firebase/firestore";
import {
  EVENT_ID,
  clearData,
  db,
  descriptor,
  eventDoc,
  seedEvent,
  teardownTestEnv,
} from "./harness";

afterAll(teardownTestEnv);
beforeEach(clearData);

describe("events/{eventId} shape", () => {
  it("accepts a well-formed event with a valid descriptor", async () => {
    const client = await db();
    await assertSucceeds(setDoc(doc(client, "events", "new-event"), {
      ...eventDoc,
      evaluation: {
        ...descriptor,
        configPath: "events/new-event/app_config/evaluation",
      },
    }));
  });

  it("accepts a descriptor-less event document (a draft event, not yet scorable)", async () => {
    const client = await db();
    const { evaluation: _drop, ...withoutDescriptor } = eventDoc;
    void _drop;
    await assertSucceeds(
      setDoc(doc(client, "events", "draft-event"), withoutDescriptor)
    );
  });

  it("rejects a descriptor whose configPath points at another event", async () => {
    const client = await db();
    await assertFails(setDoc(doc(client, "events", "new-event"), {
      ...eventDoc,
      evaluation: {
        ...descriptor,
        configPath: "events/some-other-event/app_config/evaluation",
      },
    }));
  });

  it("rejects an unknown descriptor mode and an unknown provisionedBy", async () => {
    const client = await db();
    await assertFails(setDoc(doc(client, "events", "e1"), {
      ...eventDoc,
      evaluation: {
        ...descriptor,
        configPath: "events/e1/app_config/evaluation",
        mode: "some-other-mode",
      },
    }));
    await assertFails(setDoc(doc(client, "events", "e2"), {
      ...eventDoc,
      evaluation: {
        ...descriptor,
        configPath: "events/e2/app_config/evaluation",
        provisionedBy: "curl",
      },
    }));
  });

  it("accepts both legitimate provisionedBy values", async () => {
    const client = await db();
    for (const provisionedBy of ["offline-admin-sdk", "in-app-editor"]) {
      const id = `event-${provisionedBy}`;
      await assertSucceeds(setDoc(doc(client, "events", id), {
        ...eventDoc,
        evaluation: {
          ...descriptor,
          configPath: `events/${id}/app_config/evaluation`,
          provisionedBy,
        },
      }));
    }
  });

  it("rejects unknown top-level fields", async () => {
    const client = await db();
    await assertFails(setDoc(doc(client, "events", "e3"), {
      ...eventDoc,
      evaluation: {
        ...descriptor,
        configPath: "events/e3/app_config/evaluation",
      },
      injectedField: "anything",
    }));
  });

  it("rejects a missing name or status", async () => {
    const client = await db();
    const { name: _n, ...noName } = eventDoc;
    void _n;
    await assertFails(setDoc(doc(client, "events", "e4"), {
      ...noName,
      evaluation: { ...descriptor, configPath: "events/e4/app_config/evaluation" },
    }));
  });
});

describe("configLocked is a one-way freeze", () => {
  it("rejects an event created already frozen (it would be unrecoverable)", async () => {
    const client = await db();
    await assertFails(setDoc(doc(client, "events", "born-frozen"), {
      ...eventDoc,
      evaluation: {
        ...descriptor,
        configPath: "events/born-frozen/app_config/evaluation",
      },
      configLocked: true,
    }));
  });

  it("allows false -> true", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(
      updateDoc(doc(client, "events", EVENT_ID), { configLocked: true })
    );
  });

  it("denies true -> false", async () => {
    await seedEvent({ event: { configLocked: true } });
    const client = await db();
    await assertFails(
      updateDoc(doc(client, "events", EVENT_ID), { configLocked: false })
    );
  });

  it("denies changing the descriptor while frozen, but allows cosmetic event fields", async () => {
    await seedEvent({ event: { configLocked: true } });
    const client = await db();
    await assertFails(
      updateDoc(doc(client, "events", EVENT_ID), {
        evaluation: { ...descriptor, configVersion: "sneaky-v2" },
      })
    );
    await assertSucceeds(
      updateDoc(doc(client, "events", EVENT_ID), {
        description: "renamed while frozen",
        updatedAt: Timestamp.fromMillis(1_770_000_000_000),
      })
    );
  });
});
