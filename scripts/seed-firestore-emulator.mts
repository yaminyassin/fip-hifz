#!/usr/bin/env npx tsx
/**
 * Idempotent seed script for the Firestore emulator (greenfield per-event
 * evaluation model — docs/migrations/phase-1-greenfield.md).
 *
 * Seeds:
 *  - `demo-2026`: a fully provisioned `jury-first-v2` event (via
 *    `buildExampleEvaluationConfig`), with participants across every
 *    example category and V2 evaluation scores/adjustments for the
 *    "completed ranking" fixtures — used by the Playwright e2e suite.
 *  - `unconfigured-event`: an event document with NO evaluation descriptor
 *    at all, so the app's fail-closed gate can be exercised end to end in
 *    the actual UI (not just the loader function in isolation).
 *
 * Safe to re-run: it clears the emulator database first, then writes
 * fixed-ID documents. Refuses to run against anything that isn't clearly
 * the emulator:
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
  type Firestore,
} from "firebase/firestore";
import { buildExampleEvaluationConfig } from "../src/evaluation/exampleConfigSeed";
import { validateEvaluationConfig } from "../src/evaluation/configValidation";
import { computeAssignmentHash } from "../src/evaluation/configHelpers";
import type { QuestionValueMap, AdjustmentValueMap } from "../src/evaluation/scoringEngine";

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

const EVENT_ID = "demo-2026";
const FIXED_TIMESTAMP = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

async function clearEmulatorDatabase(): Promise<void> {
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      `Failed to clear emulator database: ${response.status} ${response.statusText}`
    );
  }
}

async function buildFixtureWrites(
  firestore: Firestore
): Promise<Array<[ReturnType<typeof doc>, Record<string, unknown>]>> {
  const eventPath = (...segments: string[]) => doc(firestore, "events", EVENT_ID, ...segments);

  const writes: Array<[ReturnType<typeof doc>, Record<string, unknown>]> = [];

  // ---- Config: build, validate (fail-closed provisioning), stamp ----
  const config = await buildExampleEvaluationConfig(FIXED_TIMESTAMP);
  const validation = validateEvaluationConfig(config);
  if (!validation.ok) {
    throw new Error(
      `Refusing to seed: example config failed validation: ${validation.errors.join("; ")}`
    );
  }

  const configPath = `events/${EVENT_ID}/app_config/evaluation`;

  // events/demo-2026 — the descriptor, pointing at the config doc below.
  writes.push([
    doc(firestore, "events", EVENT_ID),
    {
      name: "Demo 2026",
      description: "Greenfield per-event evaluation trial fixture",
      status: "active",
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
      evaluation: {
        schemaVersion: 2,
        mode: config.algorithmVersion,
        configVersion: config.configVersion,
        configPath,
        contentHash: config.contentHash,
        scoringFingerprint: config.scoringFingerprint,
        provisionedBy: "offline-admin-sdk",
        provisionedAt: FIXED_TIMESTAMP,
      },
    },
  ]);

  // events/demo-2026/app_config/evaluation — the config document itself.
  writes.push([eventPath("app_config", "evaluation"), { ...config }]);

  // A second event with NO evaluation descriptor at all — exercises the
  // "an event with no valid config fails closed, visibly, in the UI" gate
  // (design doc §2, "Gating"). Never triggers any fallback; there is none.
  writes.push([
    doc(firestore, "events", "unconfigured-event"),
    {
      name: "Unconfigured Event",
      description: "Fixture: no evaluation descriptor stamped",
      status: "active",
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // events/demo-2026/app_config/previous_questions
  writes.push([
    eventPath("app_config", "previous_questions"),
    {
      previous_questions: [],
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // ---- Participants (one per example category, plus a ranking fixture) ----
  const baseParticipant = {
    country: "Demoland",
    flag: "🏳️",
    parentsName: "Fixture Parent",
    phoneNum: "+000000000",
    email: "fixture@example.com",
    photo: "",
  };

  // participant-active: CAT_A, isActive, no scores yet (jury flow starts here).
  writes.push([
    eventPath("participants", "participant-active"),
    {
      ...baseParticipant,
      name: "Ahmad Al-Hafiz",
      age: 14,
      category: "CAT_A",
      school: "Demo Quran School",
      scheduled: "1",
      isDone: false,
      isActive: true,
      assignedQuestions: [27, 76],
      activeQuestion: 27,
    },
  ]);

  // participant-inactive: CAT_B, inactive, no scores.
  writes.push([
    eventPath("participants", "participant-inactive"),
    {
      ...baseParticipant,
      name: "Bilal Rahman",
      age: 15,
      category: "CAT_B",
      school: "Demo Institute",
      scheduled: "2",
      isDone: false,
      isActive: false,
      assignedQuestions: [69, 202, 335],
      activeQuestion: 69,
    },
  ]);

  // participant-ranking-done: CAT_A, isDone true, one complete jury
  // evaluation (jury-one) exercising weights + the additive presentation
  // bonus + the additive overall_bonus adjustment. Hand-computed expected
  // final score:
  //   Q1 (page 27): hifdh impact = 1*3 + 1*2 = 5 (cap 50) -> 5
  //                 tajweed impact = 0 (cap 30) -> 0
  //                 presentation impact = 2*1 = 2 (cap 5, add) -> +2
  //                 score = 100 - 5 - 0 + 2 = 97
  //   Q2 (page 76): all zero -> score = 100
  //   juryBase = (97 + 100) / 2 = 98.5
  //   overall_bonus: bonus=2 * weight 1 = 2 (cap 5, add) -> +2
  //   juryFinal = clamp(98.5 + 2, 0, 110) = 100.5
  //   finalScore (single jury) = round2(100.5) = 100.5
  writes.push([
    eventPath("participants", "participant-ranking-done"),
    {
      ...baseParticipant,
      name: "Zainab Haddad",
      age: 17,
      category: "CAT_A",
      school: "Demo Quran School",
      scheduled: "1",
      isDone: true,
      isActive: false,
      assignedQuestions: [27, 76],
      activeQuestion: 76,
    },
  ]);

  const rankingDoneQ1Values: QuestionValueMap = {
    hifdh: { judge_correction: 1, self_correction: 1, stuck: 0 },
    tajweed: { major: 0, minor: 0 },
    presentation: { fluency: 2 },
  };
  const rankingDoneQ2Values: QuestionValueMap = {
    hifdh: { judge_correction: 0, self_correction: 0, stuck: 0 },
    tajweed: { major: 0, minor: 0 },
    presentation: { fluency: 0 },
  };
  const rankingDoneAdjustmentValues: AdjustmentValueMap = {
    overall_bonus: { bonus: 2 },
  };

  const rankingDoneAssignmentHash = await computeAssignmentHash(
    "participant-ranking-done",
    "CAT_A",
    [27, 76]
  );

  writes.push([
    eventPath("evaluationScores", "participant-ranking-done_jury-one_1"),
    {
      schemaVersion: 2,
      participantId: "participant-ranking-done",
      juryId: "jury-one",
      questionNumber: 1,
      pageNumber: 27,
      categoryId: "CAT_A",
      configVersion: config.configVersion,
      scoringFingerprint: config.scoringFingerprint,
      algorithmVersion: config.algorithmVersion,
      assignmentHash: rankingDoneAssignmentHash,
      values: rankingDoneQ1Values,
      source: { kind: "nativeV2" },
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  writes.push([
    eventPath("evaluationScores", "participant-ranking-done_jury-one_2"),
    {
      schemaVersion: 2,
      participantId: "participant-ranking-done",
      juryId: "jury-one",
      questionNumber: 2,
      pageNumber: 76,
      categoryId: "CAT_A",
      configVersion: config.configVersion,
      scoringFingerprint: config.scoringFingerprint,
      algorithmVersion: config.algorithmVersion,
      assignmentHash: rankingDoneAssignmentHash,
      values: rankingDoneQ2Values,
      source: { kind: "nativeV2" },
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  writes.push([
    eventPath("juryEvaluationInputs", "participant-ranking-done_jury-one"),
    {
      schemaVersion: 2,
      participantId: "participant-ranking-done",
      juryId: "jury-one",
      categoryId: "CAT_A",
      configVersion: config.configVersion,
      scoringFingerprint: config.scoringFingerprint,
      algorithmVersion: config.algorithmVersion,
      assignmentHash: rankingDoneAssignmentHash,
      values: rankingDoneAdjustmentValues,
      source: { kind: "nativeV2" },
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ]);

  // participant-done: CAT_M, isDone true, perfect score from jury-one (no
  // adjustment doc -> defaults to zero bonus) -> finalScore = 100.00.
  writes.push([
    eventPath("participants", "participant-done"),
    {
      ...baseParticipant,
      name: "Yusuf Karim",
      age: 16,
      category: "CAT_M",
      school: "Demo Hifz Academy",
      scheduled: "3",
      isDone: true,
      isActive: false,
      assignedQuestions: [585, 592],
      activeQuestion: 592,
    },
  ]);

  const perfectValues: QuestionValueMap = {
    hifdh: { judge_correction: 0, self_correction: 0, stuck: 0 },
    tajweed: { major: 0, minor: 0 },
    presentation: { fluency: 0 },
  };
  const doneAssignmentHash = await computeAssignmentHash("participant-done", "CAT_M", [585, 592]);

  for (const [questionNumber, pageNumber] of [
    [1, 585],
    [2, 592],
  ] as const) {
    writes.push([
      eventPath("evaluationScores", `participant-done_jury-one_${questionNumber}`),
      {
        schemaVersion: 2,
        participantId: "participant-done",
        juryId: "jury-one",
        questionNumber,
        pageNumber,
        categoryId: "CAT_M",
        configVersion: config.configVersion,
        scoringFingerprint: config.scoringFingerprint,
        algorithmVersion: config.algorithmVersion,
        assignmentHash: doneAssignmentHash,
        values: perfectValues,
        source: { kind: "nativeV2" },
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
    ]);
  }

  // ---- Jury ----
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

  // jury-three: active and not yet finished, dedicated to the end-to-end
  // jury-evaluation-flow e2e test (juryEvaluation.spec.ts) so it doesn't
  // perturb the participant-ranking-done fixture's jury-one scores above.
  writes.push([
    eventPath("jury", "jury-three"),
    {
      id: "jury-three",
      name: "Judge Three",
      currentQuestion: 1,
      hasFinishedEvaluating: false,
      isActive: true,
    },
  ]);

  return writes;
}

async function main(): Promise<void> {
  console.log(`Clearing emulator database for project "${PROJECT_ID}"...`);
  await clearEmulatorDatabase();

  const app = initializeApp({
    apiKey: "test-api-key",
    projectId: PROJECT_ID,
  });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, emulatorHost, emulatorPort);

  const writes = await buildFixtureWrites(firestore);

  console.log(`Writing ${writes.length} fixture documents...`);
  const results = await Promise.allSettled(writes.map(([ref, data]) => setDoc(ref, data)));

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error("Seed write failed:", (failure as PromiseRejectedResult).reason);
    }
    console.error(`${failures.length} of ${writes.length} writes failed.`);
    process.exit(1);
  }

  console.log(`Seeded event "${EVENT_ID}" (and "unconfigured-event") with ${writes.length} documents.`);
}

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});
