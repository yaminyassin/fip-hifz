#!/usr/bin/env npx tsx
/**
 * Provisions a NEW event together with its EvaluationConfig, per
 * docs/migrations/phase-1-greenfield.md section 5 ("Trial event to build
 * against"). Greenfield rule: an event does not exist as far as the app is
 * concerned until both its descriptor (`events/{eventId}`) and its config
 * document (`events/{eventId}/app_config/evaluation`) are written together,
 * from the same validated, hashed config object, in one batch.
 *
 * Uses `firebase-admin` (works against either target):
 *   - Firestore emulator: set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080)
 *     before running. firebase-admin auto-detects the emulator from this
 *     env var; no credentials needed.
 *   - A real Firestore project: set GOOGLE_APPLICATION_CREDENTIALS to a
 *     service account key and pass --project <projectId>.
 *
 * Fail-closed provisioning: `validateEvaluationConfig` runs BEFORE any
 * write. An invalid config aborts the script with no writes made.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npx tsx scripts/provision-event.mts --event demo-2026 --project demo-fip-hifz
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp as AdminTimestamp,
  type Firestore,
} from "firebase-admin/firestore";
import { Timestamp } from "firebase/firestore";
import { buildExampleEvaluationConfig } from "../src/evaluation/exampleConfigSeed";
import { validateEvaluationConfig } from "../src/evaluation/configValidation";
import type { EventEvaluationConfigV2 } from "../src/evaluation/types";

interface CliArgs {
  event: string;
  project: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
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
    event: args.event ?? "demo-2026",
    project:
      args.project ?? process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-fip-hifz",
  };
}

/** Converts a client-SDK Timestamp (used by the pure config builder, which
 * cannot import firebase-admin without breaking its "no app-level imports"
 * contract) into an admin-SDK Timestamp for the actual Firestore write. */
function toAdminTimestamp(ts: Timestamp): AdminTimestamp {
  return AdminTimestamp.fromMillis(ts.toMillis());
}

/** Picks a representative page near the middle of a slot's range — a
 * deterministic, reproducible "assigned question" for seed participants. */
function midpointPage(startPage: number, endPage: number): number {
  return Math.floor((startPage + endPage) / 2);
}

async function provisionEvent(
  db: Firestore,
  eventId: string,
  config: EventEvaluationConfigV2,
  provisionedAt: Timestamp
): Promise<void> {
  const configPath = `events/${eventId}/app_config/evaluation`;

  const batch = db.batch();

  batch.set(db.doc(`events/${eventId}`), {
    name: `Demo Event ${eventId}`,
    description: "Greenfield per-event evaluation trial event",
    status: "active",
    createdAt: toAdminTimestamp(provisionedAt),
    updatedAt: toAdminTimestamp(provisionedAt),
    evaluation: {
      schemaVersion: 2,
      mode: config.algorithmVersion,
      configVersion: config.configVersion,
      configPath,
      contentHash: config.contentHash,
      scoringFingerprint: config.scoringFingerprint,
      provisionedBy: "offline-admin-sdk",
      provisionedAt: toAdminTimestamp(provisionedAt),
    },
  });

  batch.set(db.doc(configPath), {
    ...config,
    provisionedAt: toAdminTimestamp(provisionedAt),
  });

  // Seed a couple of participants per category, each with a category that
  // exists in config.categories and an assignedQuestions page array drawn
  // from that category's question slots — never a hardcoded category 'A'.
  const categoryIds = Object.keys(config.categories);
  let participantIndex = 0;
  for (const categoryId of categoryIds) {
    const category = config.categories[categoryId];
    const assignedQuestions = category.questionSlots
      .slice()
      .sort((a, b) => a.questionNumber - b.questionNumber)
      .map((slot) => midpointPage(slot.pageRange.startPage, slot.pageRange.endPage));

    participantIndex++;
    const participantId = `participant-${categoryId.toLowerCase()}`;
    batch.set(db.doc(`events/${eventId}/participants/${participantId}`), {
      name: `Demo Participant ${participantIndex}`,
      age: 14 + participantIndex,
      country: "Demoland",
      category: categoryId,
      school: "Demo Quran School",
      scheduled: String(participantIndex),
      isDone: false,
      isActive: participantIndex === 1,
      flag: "🏳️",
      parentsName: "Demo Parent",
      phoneNum: "+000000000",
      assignedQuestions,
      activeQuestion: assignedQuestions[0] ?? 0,
    });
  }

  // Seed one jury member.
  batch.set(db.doc(`events/${eventId}/jury/demo-jury-one`), {
    id: "demo-jury-one",
    name: "Demo Jury One",
    currentQuestion: 1,
    hasFinishedEvaluating: false,
    isActive: true,
  });

  await batch.commit();
}

async function main(): Promise<void> {
  const { event: eventId, project: projectId } = parseArgs(process.argv.slice(2));

  const provisionedAt = Timestamp.now();
  const config = await buildExampleEvaluationConfig(provisionedAt);

  // Fail-closed provisioning: never write a config that doesn't pass its
  // own validator.
  const validation = validateEvaluationConfig(config);
  if (!validation.ok) {
    console.error(`Refusing to provision "${eventId}": config failed validation:`);
    for (const error of validation.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (getApps().length === 0) {
    initializeApp(
      usingEmulator
        ? { projectId }
        : { credential: applicationDefault(), projectId }
    );
  }
  const db = getFirestore();

  console.log(
    `Provisioning event "${eventId}" on project "${projectId}" (${
      usingEmulator ? `emulator @ ${process.env.FIRESTORE_EMULATOR_HOST}` : "real project"
    })...`
  );

  await provisionEvent(db, eventId, config, provisionedAt);

  console.log(
    `Provisioned event "${eventId}": config "${config.configVersion}" ` +
      `(${Object.keys(config.categories).length} categories, ` +
      `${Object.keys(config.questionTypes).length} question types), ` +
      `${Object.keys(config.categories).length} participants, 1 jury member.`
  );
}

main().catch((error) => {
  console.error("Provisioning failed:", error);
  process.exit(1);
});
