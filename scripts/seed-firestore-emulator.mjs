#!/usr/bin/env node
/**
 * Idempotent seed script for the Firestore emulator.
 *
 * Seeds a fixed "lisbon-2025" event fixture used by the Phase 0 Playwright
 * trial (and future emulator-backed tests). Safe to re-run: it clears the
 * emulator database first, then writes fixed-ID documents.
 *
 * Refuses to run against anything that isn't clearly the emulator:
 *  - requires FIRESTORE_EMULATOR_HOST to be set
 *  - requires the project ID to start with "demo-"
 */
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import {
  LISBON_CONFIG_CONTENT_HASH,
  LISBON_CONFIG_VERSION,
  LISBON_SCORING_FINGERPRINT,
} from "./lisbonEvaluationDescriptorFixture.mjs";
import { LISBON_EIGHT_FIELD_FIXTURE_SCORES } from "./lisbonEightFieldFixtureScores.mjs";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-fip-hifz";

if (!EMULATOR_HOST) {
  console.error(
    "Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. " +
      "This script must only run against the Firestore emulator."
  );
  process.exit(1);
}

if (!PROJECT_ID.startsWith("demo-")) {
  console.error(
    `Refusing to seed: project ID "${PROJECT_ID}" does not start with "demo-". ` +
      "This script must only run against a demo (emulator-only) project."
  );
  process.exit(1);
}

const [emulatorHost, emulatorPortRaw] = EMULATOR_HOST.split(":");
const emulatorPort = Number(emulatorPortRaw ?? "8080");

const EVENT_ID = "lisbon-2025";
const FIXED_TIMESTAMP = Timestamp.fromDate(new Date("2025-01-01T00:00:00.000Z"));

// 1x1 transparent PNG, used as a placeholder for `quran/{page}.page`.
const BLANK_PAGE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function clearEmulatorDatabase() {
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      `Failed to clear emulator database: ${response.status} ${response.statusText}`
    );
  }
}

/**
 * @param {import("firebase/firestore").Firestore} firestore
 * @returns {Array<[import("firebase/firestore").DocumentReference, Record<string, unknown>]>}
 */
function buildFixtureWrites(firestore) {
  /**
   * @param {...string} segments
   */
  const eventPath = (...segments) =>
    doc(firestore, "events", EVENT_ID, ...segments);

  /** @type {Array<[import("firebase/firestore").DocumentReference, Record<string, unknown>]>} */
  const writes = [];

  // events/lisbon-2025
  //
  // Stamps a Phase 1a evaluation descriptor (design section 2, "Event
  // metadata and config loading") but deliberately does NOT write the
  // `app_config/evaluation` document it points to. This exercises the
  // bundled-fallback trigger: loading `evaluation.configPath` fails because
  // the document is missing, and the client falls back to the bundled
  // Lisbon config ONLY because `lisbon-2025` is on the allowlist, its mode
  // is `legacy-lisbon-display-v1`, and its configVersion matches the known
  // Lisbon seed version. See src/evaluation/eventDescriptor.ts and
  // src/evaluation/__tests__/eventDescriptor.test.ts.
  writes.push([
    doc(firestore, "events", EVENT_ID),
    {
      name: "Lisbon 2025",
      description: "Phase 0 trial fixture event",
      status: "active",
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
      evaluation: {
        schemaVersion: 2,
        mode: "legacy-lisbon-display-v1",
        configVersion: LISBON_CONFIG_VERSION,
        configPath: `events/${EVENT_ID}/app_config/evaluation`,
        contentHash: LISBON_CONFIG_CONTENT_HASH,
        scoringFingerprint: LISBON_SCORING_FINGERPRINT,
        provisionedBy: "offline-admin-sdk",
        provisionedAt: FIXED_TIMESTAMP,
      },
    },
  ]);

  // A second, non-allowlisted event with NO evaluation descriptor at all —
  // exercises the "new/partial events fail closed" gate (design section 2,
  // "Config loading"): a missing descriptor never triggers the bundled
  // Lisbon fallback for any event, allowlisted or not.
  writes.push([
    doc(firestore, "events", "unconfigured-event"),
    {
      name: "Unconfigured Event",
      description: "Phase 1a fixture: no evaluation descriptor stamped",
      status: "active",
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // events/lisbon-2025/app_config/auth_settings
  writes.push([
    eventPath("app_config", "auth_settings"),
    {
      eventPassword: "phase-0-password",
      createdAt: FIXED_TIMESTAMP,
    },
  ]);

  // events/lisbon-2025/app_config/previous_questions
  writes.push([
    eventPath("app_config", "previous_questions"),
    {
      previous_questions: [],
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // Participants
  const baseParticipant = {
    country: "Portugal",
    flag: "🇵🇹",
    parentsName: "Fixture Parent",
    phoneNum: "+351000000000",
    email: "fixture@example.com",
    photo: "",
  };

  writes.push([
    eventPath("participants", "participant-active"),
    {
      ...baseParticipant,
      name: "Ahmad Al-Hafiz",
      age: 14,
      category: "A1",
      school: "Lisbon Quran School",
      scheduled: "1",
      isDone: false,
      isActive: true,
      assignedQuestions: [42, 87],
      activeQuestion: 42,
    },
  ]);

  writes.push([
    eventPath("participants", "participant-inactive"),
    {
      ...baseParticipant,
      name: "Bilal Rahman",
      age: 15,
      category: "B1",
      school: "Porto Quran Institute",
      scheduled: "2",
      isDone: false,
      isActive: false,
      assignedQuestions: [10, 55],
      activeQuestion: 10,
    },
  ]);

  // Phase 1a "completed ranking fixture" (design section 5, "Completed
  // ranking fixture"): a separate participant/score/bonus document set so
  // the unchanged eight-field fixture above stays byte-for-byte identical.
  // isDone: true and score-derived juryIds.length > 0, so it IS
  // ranking-eligible and should display finalScore = 100.5 (base 98.5 +
  // additive bonus 2), unlike `participant-active` above. Shares the "1"
  // schedule group with `participant-active` so a single rendered table can
  // assert their relative row order.
  writes.push([
    eventPath("participants", "participant-ranking-done"),
    {
      ...baseParticipant,
      name: "Zainab Haddad",
      age: 17,
      category: "A1",
      school: "Lisbon Quran School",
      scheduled: "1",
      isDone: true,
      isActive: false,
      assignedQuestions: [42, 87],
      activeQuestion: 87,
    },
  ]);

  writes.push([
    eventPath("participants", "participant-done"),
    {
      ...baseParticipant,
      name: "Yusuf Karim",
      age: 16,
      category: "C1",
      school: "Braga Hifz Academy",
      scheduled: "3",
      isDone: true,
      isActive: false,
      assignedQuestions: [5, 15, 25],
      activeQuestion: 25,
    },
  ]);

  // Jury
  writes.push([
    eventPath("jury", "jury-one"),
    {
      id: "jury-one",
      name: "Judge One",
      currentQuestion: 1,
      hasFinishedEvaluating: false,
      isActive: false,
    },
  ]);

  writes.push([
    eventPath("jury", "jury-two"),
    {
      id: "jury-two",
      name: "Judge Two",
      currentQuestion: 1,
      hasFinishedEvaluating: true,
      isActive: true,
    },
  ]);

  // Scores: pageNumber must equal
  // participant.assignedQuestions[questionNumber - 1] === assignedQuestions[0] === 42
  writes.push([
    eventPath("scores", "participant-active_jury-one_1"),
    {
      id: "participant-active_jury-one_1",
      participantId: "participant-active",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 42,
      scores: LISBON_EIGHT_FIELD_FIXTURE_SCORES,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // Overall bonus
  writes.push([
    eventPath("overallBonuses", "participant-active_jury-one"),
    {
      id: "participant-active_jury-one",
      participantId: "participant-active",
      juryId: "jury-one",
      overallBonus: 2,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // Completed ranking fixture: same eight values as the unchanged fixture
  // above (Q1 = 97, Q2 missing = 100, legacy base = 98.5), plus the same
  // bonus (2), on a separate participant/jury/score/bonus document set.
  writes.push([
    eventPath("scores", "participant-ranking-done_jury-one_1"),
    {
      id: "participant-ranking-done_jury-one_1",
      participantId: "participant-ranking-done",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 42,
      scores: LISBON_EIGHT_FIELD_FIXTURE_SCORES,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  writes.push([
    eventPath("overallBonuses", "participant-ranking-done_jury-one"),
    {
      id: "participant-ranking-done_jury-one",
      participantId: "participant-ranking-done",
      juryId: "jury-one",
      overallBonus: 2,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // Quran pages referenced by the fixture participants' assignedQuestions.
  const referencedPages = [42, 87, 10, 55, 5, 15, 25];
  for (const pageNumber of referencedPages) {
    writes.push([
      doc(firestore, "quran", pageNumber.toString()),
      {
        filename: `page-${pageNumber}.png`,
        page: BLANK_PAGE_PNG,
        timestamp: FIXED_TIMESTAMP.toDate().toISOString(),
      },
    ]);
  }

  return writes;
}

async function main() {
  console.log(`Clearing emulator database for project "${PROJECT_ID}"...`);
  await clearEmulatorDatabase();

  const app = initializeApp({
    apiKey: "test-api-key",
    projectId: PROJECT_ID,
  });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, emulatorHost, emulatorPort);

  const writes = buildFixtureWrites(firestore);

  console.log(`Writing ${writes.length} fixture documents...`);
  const results = await Promise.allSettled(
    writes.map(([ref, data]) => setDoc(ref, data))
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error("Seed write failed:", failure.reason);
    }
    console.error(`${failures.length} of ${writes.length} writes failed.`);
    process.exit(1);
  }

  console.log(
    `Seeded event "${EVENT_ID}" with ${writes.length} documents.`
  );
}

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});
