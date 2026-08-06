#!/usr/bin/env npx tsx
/**
 * Re-stamps every event's evaluation config under the CURRENT hashing
 * algorithm, and migrates the score documents that were stamped under the old
 * one.
 *
 * WHY THIS EXISTS. computeScoringFingerprint now hashes a semantic projection
 * of the config (labels and asset refs stripped) rather than the raw scoring
 * fields. Any config stamped before that change carries a fingerprint the
 * loader can no longer reproduce, so loadEvaluationConfig fails closed and the
 * event becomes unusable. This script must run in the SAME release as the
 * hashing change — never as a standalone deploy, and never before it.
 *
 * WHY IT ALSO TOUCHES SCORES. Every EvaluationScoreV2 and
 * JuryEvaluationInputsV2 carries the scoringFingerprint it was recorded under,
 * and useParticipants rejects any score whose fingerprint no longer matches the
 * event descriptor. Re-stamping the config alone would therefore orphan every
 * score already recorded. That is safe to repair here — and only here —
 * because this is an ALGORITHM change, not a semantic one: the scoring rules
 * are byte-for-byte identical, only the way they are hashed changed. So a
 * score recorded under the old fingerprint is still a valid score.
 *
 * The script only ever rewrites documents whose fingerprint equals the config's
 * OWN previous fingerprint. A score carrying any other value is stale from a
 * real config revision and is deliberately left alone.
 *
 * Dry-run by default. Usage:
 *   # emulator
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/restamp-configs.mts
 *   # real project, inspect first
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npx tsx scripts/restamp-configs.mts --project fip-hifz
 *   # then, only once the report looks right
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npx tsx scripts/restamp-configs.mts --project fip-hifz --apply
 *
 *   --event <id>   restrict to one event
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase/firestore";
import { draftFromConfig, stampDraft } from "../src/evaluation/configDraft";
import { validateEvaluationConfig } from "../src/evaluation/configValidation";
import { loadEvaluationConfig } from "../src/evaluation/eventDescriptor";
import type { EventEvaluationConfigV2 } from "../src/evaluation/types";

const FIRESTORE_BATCH_LIMIT = 500;

interface CliArgs {
  project: string;
  event: string | null;
  apply: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: Record<string, string> = {};
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--apply") {
      apply = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      args[key] = value;
      i++;
    }
  }
  return {
    project:
      args.project ?? process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-fip-hifz",
    event: args.event ?? null,
    apply,
  };
}

interface EventPlan {
  eventId: string;
  status:
    | "already-current"
    | "needs-restamp"
    | "no-descriptor"
    | "config-missing"
    | "config-invalid";
  detail?: string;
  oldContentHash?: string;
  newContentHash?: string;
  oldFingerprint?: string;
  newFingerprint?: string;
  scoreDocsToMigrate?: number;
  adjustmentDocsToMigrate?: number;
  scoreDocsLeftAlone?: number;
  restamped?: EventEvaluationConfigV2;
}

async function planEvent(db: Firestore, eventId: string): Promise<EventPlan> {
  const eventSnapshot = await db.doc(`events/${eventId}`).get();
  const eventData = eventSnapshot.data() ?? {};
  const descriptor = eventData.evaluation as Record<string, unknown> | undefined;

  if (!descriptor) {
    return {
      eventId,
      status: "no-descriptor",
      detail: "no evaluation descriptor — legacy event, not affected",
    };
  }

  const configRef = db.doc(`events/${eventId}/app_config/evaluation`);
  const configSnapshot = await configRef.get();
  if (!configSnapshot.exists) {
    return {
      eventId,
      status: "config-missing",
      detail: `descriptor points at a config document that does not exist`,
    };
  }
  const stored = configSnapshot.data() as EventEvaluationConfigV2;

  // Validate STRUCTURE only. The stored hashes are stale by definition — that
  // is the whole reason this script runs — so validation must not be the
  // hash-verifying loader path.
  const validation = validateEvaluationConfig(stored);
  if (!validation.ok) {
    return {
      eventId,
      status: "config-invalid",
      detail: validation.errors.join("; "),
    };
  }

  // provisionedAt is excluded from both hashes, so preserving the original is
  // free — and rewriting it would destroy real provenance for no benefit.
  const restamped = await stampDraft(
    draftFromConfig(stored),
    stored.provisionedAt as unknown as Timestamp
  );

  if (
    restamped.contentHash === stored.contentHash &&
    restamped.scoringFingerprint === stored.scoringFingerprint &&
    descriptor.contentHash === stored.contentHash &&
    descriptor.scoringFingerprint === stored.scoringFingerprint
  ) {
    return { eventId, status: "already-current" };
  }

  const oldFingerprint = stored.scoringFingerprint;
  const [scores, adjustments] = await Promise.all([
    db.collection(`events/${eventId}/evaluationScores`).get(),
    db.collection(`events/${eventId}/juryEvaluationInputs`).get(),
  ]);

  const matches = (d: FirebaseFirestore.QueryDocumentSnapshot) =>
    d.data().scoringFingerprint === oldFingerprint;

  const scoreDocsToMigrate = scores.docs.filter(matches).length;
  const adjustmentDocsToMigrate = adjustments.docs.filter(matches).length;

  return {
    eventId,
    status: "needs-restamp",
    oldContentHash: stored.contentHash,
    newContentHash: restamped.contentHash,
    oldFingerprint,
    newFingerprint: restamped.scoringFingerprint,
    scoreDocsToMigrate,
    adjustmentDocsToMigrate,
    scoreDocsLeftAlone:
      scores.docs.length -
      scoreDocsToMigrate +
      (adjustments.docs.length - adjustmentDocsToMigrate),
    restamped,
  };
}

async function applyPlan(
  db: Firestore,
  plan: EventPlan,
  descriptorProvisionedBy: string
): Promise<void> {
  const { eventId, restamped, oldFingerprint } = plan;
  if (!restamped || !oldFingerprint) return;

  const configRef = db.doc(`events/${eventId}/app_config/evaluation`);
  const eventRef = db.doc(`events/${eventId}`);

  // Config + descriptor together: an event whose two halves disagree fails
  // closed, so they must never be separately committed.
  const head = db.batch();
  head.set(configRef, restamped as unknown as FirebaseFirestore.DocumentData);
  head.update(eventRef, {
    "evaluation.contentHash": restamped.contentHash,
    "evaluation.scoringFingerprint": restamped.scoringFingerprint,
    "evaluation.configVersion": restamped.configVersion,
    "evaluation.provisionedBy": descriptorProvisionedBy,
  });
  await head.commit();

  // Then the score documents. Ordering matters: while this runs the event is
  // briefly readable with scores that do not yet match, which useParticipants
  // renders as "not counted" rather than as wrong data. Doing it the other way
  // round would leave scores matching a fingerprint no config claims.
  for (const collectionName of ["evaluationScores", "juryEvaluationInputs"]) {
    const snapshot = await db.collection(`events/${eventId}/${collectionName}`).get();
    const stale = snapshot.docs.filter(
      (d) => d.data().scoringFingerprint === oldFingerprint
    );
    for (let start = 0; start < stale.length; start += FIRESTORE_BATCH_LIMIT) {
      const batch = db.batch();
      for (const document of stale.slice(start, start + FIRESTORE_BATCH_LIMIT)) {
        batch.update(document.ref, {
          scoringFingerprint: restamped.scoringFingerprint,
        });
      }
      await batch.commit();
    }
  }
}

/** Proves the event loads through the real fail-closed loader afterwards. */
async function verifyEvent(db: Firestore, eventId: string): Promise<string | null> {
  const eventSnapshot = await db.doc(`events/${eventId}`).get();
  const result = await loadEvaluationConfig(eventId, {
    getEventDocument: async () => eventSnapshot.data(),
    getConfigDocument: async (path) => {
      const snapshot = await db.doc(path).get();
      return snapshot.exists ? snapshot.data() : undefined;
    },
  });
  return result.status === "ready" ? null : result.reason;
}

async function main(): Promise<void> {
  const { project, event, apply } = parseArgs(process.argv.slice(2));
  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  if (getApps().length === 0) {
    initializeApp(
      usingEmulator
        ? { projectId: project }
        : { credential: applicationDefault(), projectId: project }
    );
  }
  const db = getFirestore();

  console.log(
    `Re-stamping evaluation configs on "${project}" (${
      usingEmulator ? `emulator @ ${process.env.FIRESTORE_EMULATOR_HOST}` : "REAL PROJECT"
    })`
  );
  console.log(apply ? "MODE: apply (writes)" : "MODE: dry run (no writes)");
  console.log("");

  const eventIds = event
    ? [event]
    : (await db.collection("events").get()).docs.map((d) => d.id).sort();

  const plans: EventPlan[] = [];
  for (const eventId of eventIds) {
    plans.push(await planEvent(db, eventId));
  }

  for (const plan of plans) {
    switch (plan.status) {
      case "already-current":
        console.log(`  ${plan.eventId}: already stamped under the current algorithm`);
        break;
      case "no-descriptor":
        console.log(`  ${plan.eventId}: ${plan.detail}`);
        break;
      case "config-missing":
      case "config-invalid":
        console.log(`  ${plan.eventId}: SKIPPED — ${plan.detail}`);
        break;
      case "needs-restamp":
        console.log(`  ${plan.eventId}: NEEDS RE-STAMP`);
        console.log(
          `      contentHash        ${plan.oldContentHash?.slice(0, 12)}… -> ${plan.newContentHash?.slice(0, 12)}…`
        );
        console.log(
          `      scoringFingerprint ${plan.oldFingerprint?.slice(0, 12)}… -> ${plan.newFingerprint?.slice(0, 12)}…`
        );
        console.log(
          `      score documents to migrate: ${plan.scoreDocsToMigrate}, ` +
            `adjustments: ${plan.adjustmentDocsToMigrate}` +
            (plan.scoreDocsLeftAlone
              ? `, left alone (stale from a real revision): ${plan.scoreDocsLeftAlone}`
              : "")
        );
        break;
    }
  }

  const todo = plans.filter((p) => p.status === "needs-restamp");
  const blocked = plans.filter(
    (p) => p.status === "config-invalid" || p.status === "config-missing"
  );

  console.log("");
  if (blocked.length > 0) {
    console.log(
      `WARNING: ${blocked.length} event(s) could not be planned and will stay fail-closed.`
    );
  }
  if (todo.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!apply) {
    console.log(
      `${todo.length} event(s) would be re-stamped. Re-run with --apply to write.`
    );
    return;
  }

  console.log(`Applying to ${todo.length} event(s)...`);
  for (const plan of todo) {
    const eventSnapshot = await db.doc(`events/${plan.eventId}`).get();
    const provisionedBy =
      (eventSnapshot.data()?.evaluation?.provisionedBy as string) ??
      "offline-admin-sdk";
    await applyPlan(db, plan, provisionedBy);
    const failure = await verifyEvent(db, plan.eventId);
    if (failure) {
      console.error(`  ${plan.eventId}: FAILED verification — ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(`  ${plan.eventId}: re-stamped and verified`);
    }
  }
}

main().catch((error) => {
  console.error("Re-stamp failed:", error);
  process.exit(1);
});
