#!/usr/bin/env npx tsx
/**
 * Provisions the Ahlul Qur'an International Competition — Mozambique event:
 * its evaluation descriptor, its config, and its semi-finalist roster.
 *
 * WHY THIS SCRIPT EXISTS. The live event was created by the app's old "New
 * Event" path, which wrote only the event document and auth settings. It has
 * no `evaluation` descriptor and no `app_config/evaluation` document, so it
 * fails closed — and neither in-app path can repair it: `createEvent` refuses
 * an event id that already exists, and `publishRevision` requires a config
 * document to compare-and-set against. Repair has to come from outside the app.
 *
 * Uses the CLIENT SDK, not firebase-admin: every write here is one the
 * security rules already permit (`allow create, update` on the config document,
 * `allow update` on the event, `participantShapeOk()` on participants), so no
 * service-account key is needed. Rules are enforced rather than bypassed,
 * which is the point — if this script can write it, so can the app.
 *
 * Greenfield invariant, preserved: the descriptor and the config are written
 * in ONE batch, from the same validated and hashed config object. The event is
 * never left half-provisioned.
 *
 * Usage:
 *   # Emulator (default target)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 npx tsx scripts/provision-ahlul-quran-mozambique.mts
 *
 *   # Dry run — validates and prints the plan, writes nothing
 *   npx tsx scripts/provision-ahlul-quran-mozambique.mts --target production --dry-run
 *
 *   # Real project (requires .env, and --apply to actually write)
 *   npx tsx scripts/provision-ahlul-quran-mozambique.mts --target production --apply
 */
import { initializeApp } from "firebase/app";
import {
  Timestamp,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  AHLUL_QURAN_MOZAMBIQUE_EVENT_ID,
  buildAhlulQuranMozambiqueConfig,
} from "../src/evaluation/ahlulQuranMozambiqueSeed";
import { validateEvaluationConfig } from "../src/evaluation/configValidation";
import { loadEvaluationConfig } from "../src/evaluation/eventDescriptor";
import { getFlagForCountry } from "../src/lib/countryUtils";
import {
  generateParticipantId,
  participantIdValidationError,
} from "../src/lib/participantId";
import { loadRoster, type RosterEntry } from "./data/rosterTypes";
import type {
  EventEvaluationConfigV2,
  EventEvaluationDescriptorV2,
} from "../src/evaluation/types";

const EVENT_ID = AHLUL_QURAN_MOZAMBIQUE_EVENT_ID;
const EVENT_NAME = "Ahlul Qur'an international competition - Mozambique";
const EVENT_DESCRIPTION =
  "Ahlul Qur'an International Competition — Mozambique (semi-finals)";
const CONFIG_PATH = `events/${EVENT_ID}/app_config/evaluation`;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface CliArgs {
  target: "emulator" | "production";
  apply: boolean;
  seedJury: boolean;
  replaceParticipants: boolean;
  eventPassword: string | null;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const flags = new Set(argv.filter((token) => token.startsWith("--")));
  const valueOf = (name: string): string | null => {
    const index = argv.indexOf(name);
    if (index < 0) return null;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}`);
    }
    return value;
  };

  const target = valueOf("--target") ?? "emulator";
  if (target !== "emulator" && target !== "production") {
    throw new Error(`--target must be "emulator" or "production", got "${target}"`);
  }
  return {
    target,
    // Writing to a real project is never the default, and --dry-run always wins.
    apply: flags.has("--apply") && !flags.has("--dry-run"),
    seedJury: flags.has("--seed-jury"),
    replaceParticipants: flags.has("--replace-participants"),
    eventPassword: valueOf("--event-password"),
  };
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

interface PlannedParticipant {
  id: string;
  data: Record<string, unknown>;
}

function planParticipants(
  entries: readonly RosterEntry[],
  config: EventEvaluationConfigV2
): { planned: PlannedParticipant[]; errors: string[] } {
  const errors: string[] = [];
  const planned: PlannedParticipant[] = [];
  const seenIds = new Map<string, number>();

  for (const entry of entries) {
    const id = generateParticipantId(entry.name);
    const idError = participantIdValidationError(id);
    if (idError) {
      errors.push(`row ${entry.row} ("${entry.name}"): ${idError}`);
      continue;
    }
    const previousRow = seenIds.get(id);
    if (previousRow !== undefined) {
      errors.push(
        `row ${entry.row} ("${entry.name}") produces document id "${id}", ` +
          `which row ${previousRow} already claimed`
      );
      continue;
    }
    seenIds.set(id, entry.row);

    // Fail closed on a category the config does not define, rather than
    // writing a participant who can never be scored or randomized.
    if (!(entry.category in config.categories)) {
      errors.push(
        `row ${entry.row} ("${entry.name}"): category "${entry.category}" ` +
          `is not defined in the config`
      );
      continue;
    }

    const flag = getFlagForCountry(entry.country);
    if (!flag) {
      errors.push(
        `row ${entry.row} ("${entry.name}"): country "${entry.country}" ` +
          `has no flag in AVAILABLE_COUNTRIES`
      );
      continue;
    }

    planned.push({
      id,
      data: {
        name: entry.name,
        age: entry.age,
        country: entry.country,
        category: entry.category,
        school: entry.school,
        // `scheduled` is a SESSION BUCKET ("S5: Friday afternoon"), not a
        // running order: ParticipantsTable groups the roster by it. The sheet
        // gives no timetable, so it stays empty and everyone lands in one
        // "Unscheduled" group. Putting the sheet's row number here instead
        // would render 30 singleton sessions that do not exist.
        scheduled: "",
        isDone: false,
        isActive: false,
        flag,
        parentsName: "",
        phoneNum: "",
        email: "",
        // Left empty on purpose: pages are drawn by the randomizer at
        // competition time from the category's question slots.
        assignedQuestions: [],
        activeQuestion: 0,
      },
    });
  }

  return { planned, errors };
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

function descriptorFor(config: EventEvaluationConfigV2): EventEvaluationDescriptorV2 {
  return {
    schemaVersion: 2,
    mode: config.algorithmVersion,
    configVersion: config.configVersion,
    configPath: CONFIG_PATH,
    contentHash: config.contentHash,
    scoringFingerprint: config.scoringFingerprint,
    provisionedBy: "offline-admin-sdk",
    provisionedAt: config.provisionedAt,
  };
}

/**
 * Proves the config round-trips through the same fail-closed loader the app
 * uses at runtime, against in-memory readers. A config that survives this
 * cannot fail closed for any reason the loader checks.
 */
async function preflight(config: EventEvaluationConfigV2): Promise<void> {
  const validation = validateEvaluationConfig(config);
  if (!validation.ok) {
    throw new Error(
      `Config failed validation:\n  - ${validation.errors.join("\n  - ")}`
    );
  }

  const descriptor = descriptorFor(config);
  const loaded = await loadEvaluationConfig(EVENT_ID, {
    getEventDocument: async () => ({ evaluation: descriptor }),
    getConfigDocument: async (path) => (path === CONFIG_PATH ? config : undefined),
  });
  if (loaded.status !== "ready") {
    throw new Error(`Config would not load after publishing: ${loaded.reason}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const provisionedAt = Timestamp.now();
  const config = await buildAhlulQuranMozambiqueConfig(provisionedAt);
  await preflight(config);

  const { ROSTER, DEFERRED } = await loadRoster();
  const { planned, errors } = planParticipants(ROSTER, config);
  if (errors.length > 0) {
    console.error("Refusing to provision — the roster has errors:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  // --- Connect ---
  let db: Firestore;
  if (args.target === "emulator") {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    if (!host) {
      console.error(
        "Refusing to run: --target emulator requires FIRESTORE_EMULATOR_HOST " +
          "(e.g. 127.0.0.1:8082)."
      );
      process.exit(1);
    }
    const [hostname, port] = host.split(":");
    db = getFirestore(initializeApp({ projectId: "demo-fip-hifz" }));
    connectFirestoreEmulator(db, hostname, Number(port ?? "8080"));
  } else {
    process.loadEnvFile(new URL("../.env", import.meta.url));
    db = getFirestore(
      initializeApp({
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.VITE_FIREBASE_APP_ID,
      })
    );
  }

  // --- Report the plan ---
  const byCategory = new Map<string, number>();
  for (const participant of planned) {
    const category = participant.data.category as string;
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  console.log(`Event:        ${EVENT_ID}`);
  console.log(`Target:       ${args.target}${args.apply ? "" : "  (DRY RUN — no writes)"}`);
  console.log(`Config:       ${config.configVersion}`);
  console.log(`  contentHash        ${config.contentHash}`);
  console.log(`  scoringFingerprint ${config.scoringFingerprint}`);
  console.log(`Categories:   ${Object.keys(config.categories).join(", ")}`);
  for (const [id, category] of Object.entries(config.categories)) {
    const slots = category.questionSlots
      .map((slot) => `${slot.pageRange.startPage}-${slot.pageRange.endPage}`)
      .join("; ");
    const juzStart = Math.min(...category.questionSlots.map((s) => s.sourceJuzRange!.start));
    const juzEnd = Math.max(...category.questionSlots.map((s) => s.sourceJuzRange!.end));
    console.log(
      `  ${id.padEnd(3)} Juz ${String(juzStart).padStart(2)}-${String(juzEnd).padEnd(2)}  ` +
        `${category.questionCount}Q  pages ${slots}  ` +
        `(${byCategory.get(id) ?? 0} participants)`
    );
  }
  console.log(
    `Question types: ${Object.values(config.questionTypes)
      .sort((a, b) => a.order - b.order)
      .map((qt) => `${qt.id}[${qt.inputs.map((i) => i.id).join(",")}]`)
      .join(" ")}`
  );
  console.log(`Participants: ${planned.length} to write, ${DEFERRED.length} deferred`);
  for (const entry of DEFERRED) {
    console.log(
      `  deferred: row ${entry.row} ${entry.name} — sheet says "${entry.sheetGroup}", ` +
        `needs ${entry.candidates.join(" or ")}`
    );
  }

  // --- Guard recorded evaluations ---
  // Deleting a participant strands every score document that references them,
  // and this script deletes in one batch without the cascade that
  // deleteParticipant() performs. Refuse outright rather than orphan scores.
  const [scores, adjustments] = await Promise.all([
    getDocs(collection(db, `events/${EVENT_ID}/evaluationScores`)),
    getDocs(collection(db, `events/${EVENT_ID}/juryEvaluationInputs`)),
  ]);
  const evaluationDocumentCount = scores.size + adjustments.size;
  console.log(
    `Recorded evaluations in the target: ${scores.size} score(s), ` +
      `${adjustments.size} adjustment(s)`
  );

  // --- Guard an existing roster ---
  const existing = await getDocs(collection(db, `events/${EVENT_ID}/participants`));
  if (existing.size > 0) {
    console.log(`\nExisting participants in the target: ${existing.size}`);
    for (const document of existing.docs) {
      console.log(`  ${document.id} | ${document.data().name} | ${document.data().category}`);
    }
    if (!args.replaceParticipants) {
      console.error(
        "\nRefusing to write: this event already has participants. Their document " +
          "ids come from spellings that may differ from the sheet, so writing the " +
          "roster now would create duplicates rather than update them. Re-run with " +
          "--replace-participants to delete the existing ones and write the roster " +
          "fresh."
      );
      process.exit(1);
    }
    if (evaluationDocumentCount > 0) {
      console.error(
        `\nRefusing to replace participants: ${evaluationDocumentCount} evaluation ` +
          "document(s) already reference this event's participants, and deleting " +
          "them here would leave those scores orphaned. Clear the evaluations from " +
          "the app first (Evaluation rules -> reset), then re-run."
      );
      process.exit(1);
    }
  }

  if (!args.apply) {
    console.log("\nDry run complete. Nothing was written. Pass --apply to write.");
    process.exit(0);
  }

  // --- Write ---
  const eventSnapshot = await getDoc(doc(db, "events", EVENT_ID));
  const batch = writeBatch(db);

  // Descriptor and config, together, from the same hashed object.
  batch.set(
    doc(db, "events", EVENT_ID),
    {
      name: EVENT_NAME,
      description: EVENT_DESCRIPTION,
      status: "active",
      createdAt: eventSnapshot.data()?.createdAt ?? provisionedAt,
      updatedAt: provisionedAt,
      evaluation: descriptorFor(config),
    },
    { merge: true }
  );
  batch.set(doc(db, CONFIG_PATH), config);

  if (args.replaceParticipants) {
    for (const document of existing.docs) batch.delete(document.ref);
  }
  for (const participant of planned) {
    batch.set(doc(db, `events/${EVENT_ID}/participants/${participant.id}`), participant.data);
  }

  if (args.seedJury) {
    for (let index = 1; index <= 3; index++) {
      batch.set(doc(db, `events/${EVENT_ID}/jury/jury-${index}`), {
        id: `jury-${index}`,
        name: `Jury ${index}`,
        currentQuestion: 1,
        hasFinishedEvaluating: false,
        isActive: true,
      });
    }
  }

  if (args.eventPassword) {
    const authSettings = await getDoc(
      doc(db, "events", EVENT_ID, "app_config", "auth_settings")
    );
    if (authSettings.exists()) {
      console.warn(
        "\nIgnoring --event-password: this event already has auth settings, " +
          "and firestore.rules allows them to be created but never updated."
      );
    } else {
      batch.set(doc(db, "events", EVENT_ID, "app_config", "auth_settings"), {
        eventPassword: args.eventPassword,
        createdAt: provisionedAt,
      });
    }
  }
  // Without --event-password nothing is written here on purpose. useAuth mints
  // a `${eventId}-admin` default on the first login attempt, and that default
  // is exactly what a provisioner must not silently bake in as if an organizer
  // had chosen it.

  await batch.commit();

  console.log(
    `\nProvisioned "${EVENT_ID}": config ${config.configVersion} ` +
      `(${Object.keys(config.categories).length} categories, ` +
      `${Object.keys(config.questionTypes).length} question types), ` +
      `${planned.length} participants` +
      (args.seedJury ? ", 3 jury members" : "") +
      "."
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Provisioning failed:", error);
  process.exit(1);
});
