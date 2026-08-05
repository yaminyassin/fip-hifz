import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { firestore } from "@/main";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import { stampDraft, type ConfigDraft } from "@/evaluation/configDraft";
import { normalizeGeneratedIds } from "@/evaluation/configIds";
import { classifyConfigChange, type ConfigChangeKind } from "@/evaluation/configSemantics";
import { validateEvaluationConfig } from "@/evaluation/configValidation";
import { loadEvaluationConfig } from "@/evaluation/eventDescriptor";
import {
  EVALUATION_SCORES_COLLECTION,
  JURY_EVALUATION_INPUTS_COLLECTION,
} from "@/services/evaluationScores";
import type {
  EventEvaluationConfigV2,
  EventEvaluationDescriptorV2,
} from "@/evaluation/types";

/**
 * Writing an event's evaluation config from the browser.
 *
 * Two invariants govern everything here:
 *
 * 1. AN EVENT IS NEVER PARTIALLY PROVISIONED. The descriptor on
 *    events/{id} and the config at app_config/evaluation must agree or the
 *    event fails closed. They are therefore always written in a single atomic
 *    commit — never descriptor-then-config, which would leave a window where
 *    the event is visibly broken.
 *
 * 2. NOTHING IS PUBLISHED THAT CANNOT BE LOADED. `preflight` runs the real
 *    loadEvaluationConfig against in-memory readers before any write. If the
 *    config would fail closed after publishing, it fails here instead, where
 *    the organizer can still fix it.
 */

export function configPathFor(eventId: string): string {
  return `events/${eventId}/app_config/evaluation`;
}

function descriptorFor(
  eventId: string,
  config: EventEvaluationConfigV2
): EventEvaluationDescriptorV2 {
  return {
    schemaVersion: 2,
    mode: config.algorithmVersion,
    configVersion: config.configVersion,
    configPath: configPathFor(eventId),
    contentHash: config.contentHash,
    scoringFingerprint: config.scoringFingerprint,
    provisionedBy: "in-app-editor",
    provisionedAt: config.provisionedAt,
  };
}

export type PreflightResult =
  | { ok: true; config: EventEvaluationConfigV2 }
  | { ok: false; reason: string; errors: string[] };

/**
 * Stamps a draft, validates it, and then proves it round-trips: the stamped
 * config is fed to the same loader the app uses at runtime, through in-memory
 * readers standing in for Firestore. A config that survives this cannot fail
 * closed for any reason the loader checks — hash mismatch, fingerprint
 * mismatch, descriptor disagreement, or boundary validation.
 */
export async function preflight(
  eventId: string,
  draft: ConfigDraft,
  provisionedAt: Timestamp = Timestamp.now()
): Promise<PreflightResult> {
  let config: EventEvaluationConfigV2;
  try {
    config = await stampDraft(draft, provisionedAt);
  } catch (error) {
    return {
      ok: false,
      reason: "could not compute the configuration hashes",
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  const validation = validateEvaluationConfig(config);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "the configuration is not valid",
      errors: validation.errors,
    };
  }

  const descriptor = descriptorFor(eventId, config);
  const loaded = await loadEvaluationConfig(eventId, {
    getEventDocument: async () => ({ evaluation: descriptor }),
    getConfigDocument: async (path) =>
      path === descriptor.configPath ? config : undefined,
  });

  if (loaded.status !== "ready") {
    // Reaching here means stamping and validation disagree with the loader,
    // which is a bug in this module rather than bad operator input.
    return {
      ok: false,
      reason: "the configuration would not load after publishing",
      errors: [loaded.reason],
    };
  }

  return { ok: true, config };
}

export interface CreateEventParams {
  eventId: string;
  name: string;
  description?: string;
  eventPassword: string;
  draft: ConfigDraft;
  provisionedAt?: Timestamp;
}

/**
 * Creates a fully provisioned, immediately scorable event in ONE commit:
 * event document, descriptor, config, and auth settings.
 *
 * This replaces the previous in-app "New Event" path, which wrote only the
 * event document and auth settings and therefore produced an event that
 * failed closed forever with no way to fix it from inside the app.
 */
export async function createEvent(
  params: CreateEventParams,
  db: Firestore = firestore
): Promise<EventEvaluationConfigV2> {
  const provisionedAt = params.provisionedAt ?? Timestamp.now();

  const existing = await getDoc(doc(db, "events", params.eventId));
  if (existing.exists()) {
    throw new Error(
      `An event with the id "${params.eventId}" already exists. Choose a different name.`
    );
  }

  // Nothing is published yet, so every generated id is free to become a
  // readable one derived from the label the organizer typed.
  const { draft: named } = normalizeGeneratedIds(params.draft);

  const checked = await preflight(params.eventId, named, provisionedAt);
  if (!checked.ok) {
    throw new Error(`${checked.reason}: ${checked.errors.join("; ")}`);
  }
  const config = checked.config;

  const batch = writeBatch(db);
  batch.set(doc(db, "events", params.eventId), {
    name: params.name,
    description: params.description ?? "",
    status: "active",
    createdAt: provisionedAt,
    updatedAt: provisionedAt,
    evaluation: descriptorFor(params.eventId, config),
  });
  batch.set(doc(db, configPathFor(params.eventId)), config);
  batch.set(
    doc(db, "events", params.eventId, "app_config", "auth_settings"),
    { eventPassword: params.eventPassword, createdAt: provisionedAt }
  );
  await batch.commit();

  return config;
}

/** How many evaluation documents already exist for an event. */
export async function countEvaluationDocs(
  eventId: string,
  db: Firestore = firestore
): Promise<{ scores: number; adjustments: number; total: number }> {
  const [scores, adjustments] = await Promise.all([
    getCountFromServer(
      collection(db, getEventCollectionPath(eventId, EVALUATION_SCORES_COLLECTION))
    ),
    getCountFromServer(
      collection(
        db,
        getEventCollectionPath(eventId, JURY_EVALUATION_INPUTS_COLLECTION)
      )
    ),
  ]);
  const s = scores.data().count;
  const a = adjustments.data().count;
  return { scores: s, adjustments: a, total: s + a };
}

export type EditGuardVerdict =
  /** Nothing changed. */
  | { kind: "none" }
  /** Safe to publish: no scores exist yet, or the edit is cosmetic. */
  | { kind: "allow"; reason: string }
  /** Publishing invalidates existing scores. Needs explicit acknowledgement. */
  | { kind: "requireRescore"; affectedDocuments: number; reason: string }
  /** Refused outright — publishing would corrupt or strand live data. */
  | { kind: "block"; reason: string };

export interface EditGuardInput {
  published: EventEvaluationConfigV2;
  candidate: EventEvaluationConfigV2;
  /** Category ids currently in use by at least one participant. */
  categoriesInUse: ReadonlySet<string>;
  /** Category ids where at least one participant already has assigned questions. */
  categoriesWithAssignments: ReadonlySet<string>;
  evaluationDocumentCount: number;
}

/**
 * Decides whether a config edit may be published.
 *
 * The dangerous case this exists for: republishing a config changes its
 * scoringFingerprint, and useParticipants rejects every score stamped with
 * the old one. Without a guard, an organizer fixing a weight mid-competition
 * silently empties the ranking.
 *
 * Cosmetic edits are exempt because the fingerprint deliberately ignores
 * presentation (see configSemantics.ts) — a renamed label leaves every
 * recorded score valid.
 */
export function evaluateEditGuard(input: EditGuardInput): EditGuardVerdict {
  const change: ConfigChangeKind = classifyConfigChange(
    input.published,
    input.candidate
  );
  if (change === "none") return { kind: "none" };

  // Structural blocks apply regardless of whether scores exist: they strand
  // participants rather than merely invalidating scores.
  for (const categoryId of input.categoriesInUse) {
    if (!(categoryId in input.candidate.categories)) {
      return {
        kind: "block",
        reason:
          `Category "${categoryId}" still has participants assigned to it. ` +
          `Move or remove those participants before deleting the category.`,
      };
    }
  }

  for (const categoryId of input.categoriesWithAssignments) {
    const before = input.published.categories[categoryId]?.questionCount;
    const after = input.candidate.categories[categoryId]?.questionCount;
    if (before !== undefined && after !== undefined && before !== after) {
      return {
        kind: "block",
        reason:
          `Category "${categoryId}" has participants with questions already ` +
          `assigned, so its question count cannot change from ${before} to ${after}. ` +
          `Clear those assignments first.`,
      };
    }
  }

  if (change === "cosmetic") {
    return {
      kind: "allow",
      reason:
        "Only labels and images changed, so existing scores stay valid.",
    };
  }

  if (input.evaluationDocumentCount === 0) {
    return {
      kind: "allow",
      reason: "No scores have been recorded yet.",
    };
  }

  return {
    kind: "requireRescore",
    affectedDocuments: input.evaluationDocumentCount,
    reason:
      `This changes how scores are calculated. ` +
      `${input.evaluationDocumentCount} recorded evaluation document(s) were ` +
      `scored under the previous rules and will stop counting towards the ` +
      `ranking until they are re-entered.`,
  };
}

/**
 * Publishes a revised config with a compare-and-set on the CURRENTLY stored
 * contentHash, so two operators editing the same event cannot silently
 * overwrite each other. The descriptor and config are updated together.
 */
export async function publishRevision(
  eventId: string,
  draft: ConfigDraft,
  expectedContentHash: string,
  db: Firestore = firestore,
  provisionedAt: Timestamp = Timestamp.now(),
  /** Ids in the currently published config. These are frozen: score documents
   * reference categoryId and assignment hashes are computed over it, so a
   * published id can never be renamed. Rows added since publication still
   * carry generated ids and do get readable ones. */
  publishedIds: ReadonlySet<string> = new Set()
): Promise<EventEvaluationConfigV2> {
  const { draft: named } = normalizeGeneratedIds(draft, publishedIds);
  const checked = await preflight(eventId, named, provisionedAt);
  if (!checked.ok) {
    throw new Error(`${checked.reason}: ${checked.errors.join("; ")}`);
  }
  const config = checked.config;

  const eventRef = doc(db, "events", eventId);
  const configRef = doc(db, configPathFor(eventId));

  await runTransaction(db, async (transaction) => {
    const configSnapshot = await transaction.get(configRef);
    if (!configSnapshot.exists()) {
      throw new Error(
        `Event "${eventId}" has no configuration to revise. Create it first.`
      );
    }
    const currentHash = configSnapshot.data().contentHash;
    if (currentHash !== expectedContentHash) {
      throw new Error(
        "This event's configuration changed in another window since you " +
          "started editing. Reload and reapply your changes."
      );
    }

    const eventSnapshot = await transaction.get(eventRef);
    if (eventSnapshot.data()?.configLocked === true) {
      throw new Error(
        "This event's configuration is frozen and can no longer be changed."
      );
    }

    transaction.set(configRef, config);
    transaction.update(eventRef, {
      evaluation: descriptorFor(eventId, config),
      updatedAt: provisionedAt,
    });
  });

  return config;
}

/**
 * One-way freeze. Once set, firestore.rules refuses any further write to the
 * descriptor or the config document — including from this app. There is
 * deliberately no unlock: the point is that a config cannot change under a
 * competition that is already being scored.
 */
export async function lockConfig(
  eventId: string,
  db: Firestore = firestore
): Promise<void> {
  const { updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(db, "events", eventId), { configLocked: true });
}

/**
 * Deletes every recorded evaluation document for an event — the "re-enter
 * everything under the new rules" half of a rescore. Destructive and not
 * atomic across batches; deletion is idempotent so an interrupted run
 * completes on a retry.
 */
export async function resetEvaluation(
  eventId: string,
  db: Firestore = firestore
): Promise<number> {
  const FIRESTORE_BATCH_LIMIT = 500;
  let deleted = 0;
  for (const collectionName of [
    EVALUATION_SCORES_COLLECTION,
    JURY_EVALUATION_INPUTS_COLLECTION,
  ]) {
    const snapshot = await getDocs(
      collection(db, getEventCollectionPath(eventId, collectionName))
    );
    const refs = snapshot.docs.map((d) => d.ref);
    for (let start = 0; start < refs.length; start += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(start, start + FIRESTORE_BATCH_LIMIT)) {
        batch.delete(ref);
      }
      await batch.commit();
      deleted += Math.min(FIRESTORE_BATCH_LIMIT, refs.length - start);
    }
  }
  return deleted;
}
