import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { assertSucceeds } from "@firebase/rules-unit-testing";
import { Timestamp, doc, writeBatch } from "firebase/firestore";
import {
  CONFIG_VERSION,
  clearData,
  db,
  descriptor,
  evaluationConfig,
  teardownTestEnv,
} from "./harness";

afterAll(teardownTestEnv);
beforeEach(clearData);

/**
 * The in-app config editor creates an event as ONE batched write: event
 * document + descriptor, config document, and auth settings together, so an
 * event can never exist in a partially provisioned state.
 *
 * This is the case that broke in the browser and that no other test covered:
 * inside a batch, get() and exists() observe PRE-COMMIT state, so the event
 * document does not exist yet while the config document in the SAME batch is
 * being evaluated. A rule that did `get(.../events/$(eventId)).data...` there
 * dereferenced null and failed the whole batch with "Null value error".
 */
describe("createEvent's atomic batch", () => {
  const EVENT_ID = "porto-2027";

  function batchPayload() {
    const configPath = `events/${EVENT_ID}/app_config/evaluation`;
    const provisionedAt = Timestamp.fromMillis(1_760_000_000_000);
    return {
      event: {
        name: "Porto 2027",
        description: "",
        status: "active",
        createdAt: provisionedAt,
        updatedAt: provisionedAt,
        evaluation: {
          ...descriptor,
          configPath,
          configVersion: CONFIG_VERSION,
          provisionedBy: "in-app-editor",
          provisionedAt,
        },
      },
      config: { ...evaluationConfig, provisionedAt },
      auth: { eventPassword: "porto-2027-pass", createdAt: provisionedAt },
    };
  }

  it("commits event, config and auth settings in one batch against a database where the event does not yet exist", async () => {
    const client = await db();
    const payload = batchPayload();

    const batch = writeBatch(client);
    batch.set(doc(client, "events", EVENT_ID), payload.event);
    batch.set(
      doc(client, "events", EVENT_ID, "app_config", "evaluation"),
      payload.config
    );
    batch.set(
      doc(client, "events", EVENT_ID, "app_config", "auth_settings"),
      payload.auth
    );

    await assertSucceeds(batch.commit());
  });

  it("still creates cleanly a second time under a different id", async () => {
    const client = await db();
    const otherId = "madrid-2028";
    const payload = batchPayload();
    const configPath = `events/${otherId}/app_config/evaluation`;

    const batch = writeBatch(client);
    batch.set(doc(client, "events", otherId), {
      ...payload.event,
      name: "Madrid 2028",
      evaluation: { ...payload.event.evaluation, configPath },
    });
    batch.set(
      doc(client, "events", otherId, "app_config", "evaluation"),
      payload.config
    );
    batch.set(
      doc(client, "events", otherId, "app_config", "auth_settings"),
      payload.auth
    );

    await assertSucceeds(batch.commit());
  });

  it("writes an evaluation_draft for an event that does not exist yet", async () => {
    // The editor autosaves drafts, and the draft rule consults the same freeze
    // flag on a possibly-absent event document.
    const client = await db();
    await assertSucceeds(
      (async () => {
        const { setDoc } = await import("firebase/firestore");
        await setDoc(
          doc(client, "events", "not-created-yet", "app_config", "evaluation_draft"),
          { scratch: true }
        );
      })()
    );
  });

  it("reports a comprehensible failure when the config is malformed, not a null error", async () => {
    const client = await db();
    const payload = batchPayload();
    const batch = writeBatch(client);
    batch.set(doc(client, "events", "bad-event"), {
      ...payload.event,
      evaluation: {
        ...payload.event.evaluation,
        configPath: "events/bad-event/app_config/evaluation",
      },
    });
    batch.set(
      doc(client, "events", "bad-event", "app_config", "evaluation"),
      { ...payload.config, categories: {} } // no categories
    );

    await expect(batch.commit()).rejects.toThrow();
  });
});
