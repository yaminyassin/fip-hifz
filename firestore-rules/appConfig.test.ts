import { afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  EVENT_ID,
  clearData,
  db,
  evaluationConfig,
  seed,
  seedEvent,
  teardownTestEnv,
} from "./harness";

afterAll(teardownTestEnv);
beforeEach(clearData);

const configRef = (client: Awaited<ReturnType<typeof db>>) =>
  doc(client, "events", EVENT_ID, "app_config", "evaluation");

describe("app_config/evaluation", () => {
  it("is client-writable — the in-app editor publishes it", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(setDoc(configRef(client), evaluationConfig));
  });

  it("is world-readable", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(getDoc(configRef(client)));
  });

  it("rejects a config with no categories or no question types", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(configRef(client), { ...evaluationConfig, categories: {} })
    );
    await assertFails(
      setDoc(configRef(client), { ...evaluationConfig, questionTypes: {} })
    );
  });

  it("rejects a foreign algorithmVersion and a non-v2 schemaVersion", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(configRef(client), {
        ...evaluationConfig,
        algorithmVersion: "legacy-lisbon-display-v1",
      })
    );
    await assertFails(
      setDoc(configRef(client), { ...evaluationConfig, schemaVersion: 1 })
    );
  });

  it("rejects unknown fields and a missing contentHash", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(configRef(client), { ...evaluationConfig, backdoor: true })
    );
    const { contentHash: _h, ...noHash } = evaluationConfig;
    void _h;
    await assertFails(setDoc(configRef(client), noHash));
  });

  it("is frozen once configLocked is set", async () => {
    await seedEvent({ event: { configLocked: true } });
    const client = await db();
    await assertFails(setDoc(configRef(client), evaluationConfig));
  });

  it("cannot be deleted", async () => {
    await seedEvent();
    const client = await db();
    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(configRef(client)));
  });
});

describe("app_config/evaluation_draft", () => {
  it("accepts arbitrary in-progress shapes", async () => {
    await seedEvent();
    const client = await db();
    await assertSucceeds(
      setDoc(doc(client, "events", EVENT_ID, "app_config", "evaluation_draft"), {
        halfFinished: true,
        categories: { CAT_A: { questionCount: 0 } },
      })
    );
  });

  it("is frozen with the rest of the config", async () => {
    await seedEvent({ event: { configLocked: true } });
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "app_config", "evaluation_draft"), {
        anything: 1,
      })
    );
  });
});

describe("app_config/auth_settings", () => {
  it("can be created once but never updated or deleted", async () => {
    await seedEvent();
    const client = await db();
    const ref = doc(client, "events", EVENT_ID, "app_config", "auth_settings");
    await assertSucceeds(setDoc(ref, { eventPassword: "porto-2027-pass" }));
    // This is the password-takeover path the audit found in useAuth.
    await assertFails(setDoc(ref, { eventPassword: "hijacked" }));
    await assertFails(updateDoc(ref, { eventPassword: "hijacked" }));
    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(ref));
  });

  it("rejects an empty password", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "app_config", "auth_settings"), {
        eventPassword: "",
      })
    );
  });
});

describe("app_config/previous_questions", () => {
  it("accepts the randomizer's create, arrayUnion append, and full replace", async () => {
    await seedEvent();
    const client = await db();
    const ref = doc(
      client,
      "events",
      EVENT_ID,
      "app_config",
      "previous_questions"
    );
    // services/appConfig.ts createPath
    await assertSucceeds(
      setDoc(ref, {
        previous_questions: [27, 76],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    // addToPreviousQuestions
    await assertSucceeds(
      updateDoc(ref, {
        previous_questions: arrayUnion(101, 102),
        updatedAt: serverTimestamp(),
      })
    );
    // setPreviousQuestions
    await assertSucceeds(
      updateDoc(ref, {
        previous_questions: [5],
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("rejects a non-list value", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(
        doc(client, "events", EVENT_ID, "app_config", "previous_questions"),
        { previous_questions: "27,76" }
      )
    );
  });
});

describe("app_config/legacy_results", () => {
  it("is readable but never client-writable — archived results are immutable", async () => {
    await seedEvent();
    await seed(async (d) => {
      await setDoc(
        doc(d, "events", EVENT_ID, "app_config", "legacy_results"),
        { results: [{ participantId: "x", finalScore: 96.25 }] }
      );
    });
    const client = await db();
    await assertSucceeds(
      getDoc(doc(client, "events", EVENT_ID, "app_config", "legacy_results"))
    );
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "app_config", "legacy_results"), {
        results: [],
      })
    );
  });
});

describe("unknown app_config documents", () => {
  it("are readable but not writable", async () => {
    await seedEvent();
    const client = await db();
    await assertFails(
      setDoc(doc(client, "events", EVENT_ID, "app_config", "whatever"), { a: 1 })
    );
  });
});
