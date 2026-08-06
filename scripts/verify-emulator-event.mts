#!/usr/bin/env npx tsx
/**
 * Independently verifies that an event in the Firestore emulator is correctly
 * structured and correctly scored.
 *
 * The point is INDEPENDENCE. The app already believes it wrote the right
 * documents; this script re-derives every claim from first principles —
 * document ids are recomputed from their logical keys, the config is put
 * through the real fail-closed loader, and the final score is recomputed by
 * running the scoring engine over the raw stored values. A bug that corrupts
 * both the write and the read would still be caught here.
 *
 * Reads through firebase-admin, which bypasses security rules. That is
 * deliberate: this asserts what IS in the database, not what a client is
 * allowed to see.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8082 \
 *     npx tsx scripts/verify-emulator-event.mts --event porto-2027
 *
 *   ... --expect-score "Amina Sy=13.33"   (optional, repeatable)
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { loadEvaluationConfig } from "../src/evaluation/eventDescriptor";
import { validateEvaluationConfig } from "../src/evaluation/configValidation";
import { canonicalStringify, sha256Hex } from "../src/evaluation/configHash";
import {
  scoreJury,
  scoreParticipant,
  type AdjustmentValueMap,
  type JuryScoreResult,
  type QuestionValueMap,
} from "../src/evaluation/scoringEngine";
import type { EventEvaluationConfigV2 } from "../src/evaluation/types";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!EMULATOR_HOST) {
  console.error(
    "Refusing to run: FIRESTORE_EMULATOR_HOST is not set. This script only " +
      "verifies emulator data, never a real project."
  );
  process.exit(1);
}

/** Collections that may exist under an event. Anything else is a stray write. */
const ALLOWED_EVENT_SUBCOLLECTIONS = new Set([
  "app_config",
  "participants",
  "jury",
  "evaluationScores",
  "juryEvaluationInputs",
]);

const ALLOWED_APP_CONFIG_DOCS = new Set([
  "evaluation",
  "evaluation_draft",
  "auth_settings",
  "previous_questions",
  "legacy_results",
]);

interface Args {
  event: string;
  expectScores: Map<string, number>;
}

function parseArgs(argv: string[]): Args {
  let event = "";
  const expectScores = new Map<string, number>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--event") event = argv[++i] ?? "";
    else if (argv[i] === "--expect-score") {
      const raw = argv[++i] ?? "";
      const index = raw.lastIndexOf("=");
      if (index > 0) {
        expectScores.set(raw.slice(0, index), Number(raw.slice(index + 1)));
      }
    }
  }
  if (!event) {
    console.error("usage: verify-emulator-event.mts --event <eventId> [--expect-score 'Name=13.33']");
    process.exit(1);
  }
  return { event, expectScores };
}

// ---------- reporting ----------

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = ""): boolean {
  checks++;
  if (ok) {
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

function section(title: string): void {
  console.log(`\n${title}`);
}

// ---------- checks ----------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-fip-hifz" });
  }
  const db = getFirestore();

  console.log(`Verifying event "${args.event}" on ${EMULATOR_HOST}`);

  // 1. Event document + descriptor
  section("1. Event document and evaluation descriptor");
  const eventSnapshot = await db.doc(`events/${args.event}`).get();
  if (!check("event document exists", eventSnapshot.exists)) {
    return finish();
  }
  const eventData = eventSnapshot.data() ?? {};
  const descriptor = eventData.evaluation as Record<string, unknown> | undefined;
  check("has an evaluation descriptor", descriptor !== undefined);
  if (descriptor) {
    check("descriptor schemaVersion is 2", descriptor.schemaVersion === 2);
    check("descriptor mode is jury-first-v2", descriptor.mode === "jury-first-v2");
    check(
      "descriptor provisionedBy is a known writer",
      descriptor.provisionedBy === "in-app-editor" ||
        descriptor.provisionedBy === "offline-admin-sdk",
      String(descriptor.provisionedBy)
    );
    check(
      "descriptor configPath points at this event",
      descriptor.configPath === `events/${args.event}/app_config/evaluation`,
      String(descriptor.configPath)
    );
  }

  // 2. The config loads through the REAL fail-closed loader
  section("2. Config loads through the production loader");
  const loaded = await loadEvaluationConfig(args.event, {
    getEventDocument: async () => eventData,
    getConfigDocument: async (path) => {
      const snapshot = await db.doc(path).get();
      return snapshot.exists ? snapshot.data() : undefined;
    },
  });
  check(
    "loadEvaluationConfig returns ready",
    loaded.status === "ready",
    loaded.status === "ready" ? "" : loaded.reason
  );
  if (loaded.status !== "ready") return finish();
  const config = loaded.config;
  check("config passes boundary validation", validateEvaluationConfig(config).ok);
  check(
    "config defines at least one category and one question type",
    Object.keys(config.categories).length > 0 &&
      Object.keys(config.questionTypes).length > 0,
    `${Object.keys(config.categories).length} categories, ${Object.keys(config.questionTypes).length} question types`
  );

  // 3. Auth settings
  section("3. Auth settings");
  const auth = await db
    .doc(`events/${args.event}/app_config/auth_settings`)
    .get();
  check("auth_settings exists", auth.exists);
  check(
    "eventPassword is set and is not the self-issued default",
    typeof auth.data()?.eventPassword === "string" &&
      auth.data()?.eventPassword.length > 0 &&
      auth.data()?.eventPassword !== `${args.event}-admin`,
    auth.data()?.eventPassword === `${args.event}-admin`
      ? "it IS the self-issued default — useAuth minted this, not the organizer"
      : ""
  );

  // 4. No stray collections
  section("4. Document placement");
  const eventCollections = await eventSnapshot.ref.listCollections();
  for (const collection of eventCollections) {
    check(
      `subcollection "${collection.id}" is expected`,
      ALLOWED_EVENT_SUBCOLLECTIONS.has(collection.id)
    );
  }
  const appConfigDocs = await db
    .collection(`events/${args.event}/app_config`)
    .listDocuments();
  for (const document of appConfigDocs) {
    check(
      `app_config/${document.id} is expected`,
      ALLOWED_APP_CONFIG_DOCS.has(document.id)
    );
  }
  const rootCollections = await db.listCollections();
  for (const collection of rootCollections) {
    check(
      `root collection "${collection.id}" is expected`,
      collection.id === "events",
      collection.id === "events" ? "" : "stray root collection"
    );
  }

  // 5. Participants reference real categories
  section("5. Participants");
  const participants = await db
    .collection(`events/${args.event}/participants`)
    .get();
  check("at least one participant exists", participants.size > 0, `${participants.size}`);
  for (const participant of participants.docs) {
    const data = participant.data();
    check(
      `participant "${data.name}" has a category defined in the config`,
      typeof data.category === "string" && data.category in config.categories,
      String(data.category)
    );
  }

  // 6. Assigned pages fall inside their category's slot ranges
  section("6. Assigned questions fall inside their configured page ranges");
  for (const participant of participants.docs) {
    const data = participant.data();
    const category = config.categories[data.category];
    if (!category) continue;
    const assigned: number[] = Array.isArray(data.assignedQuestions)
      ? data.assignedQuestions
      : [];
    if (assigned.length === 0) continue;

    check(
      `"${data.name}" has ${category.questionCount} assigned page(s)`,
      assigned.length === category.questionCount,
      `${assigned.length}`
    );
    const slots = [...category.questionSlots].sort(
      (a, b) => a.questionNumber - b.questionNumber
    );
    assigned.forEach((page, index) => {
      const slot = slots[index];
      if (!slot) return;
      check(
        `"${data.name}" Q${index + 1} page ${page} is within ${slot.pageRange.startPage}-${slot.pageRange.endPage}`,
        page >= slot.pageRange.startPage && page <= slot.pageRange.endPage
      );
    });
  }

  // 7. Score document ids are the hash of their logical key
  section("7. Evaluation document identity and provenance");
  const scores = await db
    .collection(`events/${args.event}/evaluationScores`)
    .get();
  const adjustments = await db
    .collection(`events/${args.event}/juryEvaluationInputs`)
    .get();
  console.log(
    `  (${scores.size} score document(s), ${adjustments.size} adjustment document(s))`
  );

  for (const score of scores.docs) {
    const data = score.data();
    const expectedId = await sha256Hex(
      canonicalStringify({
        participantId: data.participantId,
        juryId: data.juryId,
        questionNumber: data.questionNumber,
      })
    );
    check(
      `score ${data.participantId}/${data.juryId}/Q${data.questionNumber} has a derived id`,
      score.id === expectedId,
      score.id === expectedId ? "" : `id is ${score.id}, expected ${expectedId}`
    );
    check(
      `score ${data.participantId}/Q${data.questionNumber} carries current provenance`,
      data.configVersion === config.configVersion &&
        data.scoringFingerprint === config.scoringFingerprint &&
        data.algorithmVersion === config.algorithmVersion
    );
  }

  for (const adjustment of adjustments.docs) {
    const data = adjustment.data();
    const expectedId = await sha256Hex(
      canonicalStringify({
        participantId: data.participantId,
        juryId: data.juryId,
      })
    );
    check(
      `adjustment ${data.participantId}/${data.juryId} has a derived id`,
      adjustment.id === expectedId,
      adjustment.id === expectedId ? "" : `id is ${adjustment.id}`
    );
  }

  // 8. Recompute every participant's score from raw stored values
  section("8. Independently recomputed scores");
  for (const participant of participants.docs) {
    const data = participant.data();
    const category = config.categories[data.category];
    if (!category) continue;

    const participantScores = scores.docs.filter(
      (d) => d.data().participantId === participant.id
    );
    if (participantScores.length === 0) continue;

    const juryIds = [
      ...new Set(participantScores.map((d) => d.data().juryId as string)),
    ];
    const juries = juryIds.map((juryId) => {
      const perQuestion = new Map<number, QuestionValueMap>();
      for (const document of participantScores) {
        const scoreData = document.data();
        if (scoreData.juryId !== juryId) continue;
        perQuestion.set(scoreData.questionNumber, scoreData.values as QuestionValueMap);
      }
      const adjustmentDocument = adjustments.docs.find(
        (d) => d.data().participantId === participant.id && d.data().juryId === juryId
      );
      return {
        juryId,
        questionValues: perQuestion,
        adjustmentValues: (adjustmentDocument?.data().values ??
          {}) as AdjustmentValueMap,
      };
    });

    const recomputed = recompute(config, category.questionCount, juries);
    const expected = args.expectScores.get(String(data.name));
    if (expected !== undefined) {
      check(
        `"${data.name}" recomputes to ${expected}`,
        recomputed !== null && Math.abs(recomputed - expected) < 0.005,
        `got ${recomputed === null ? "no score" : recomputed}`
      );
    } else {
      console.log(
        `  INFO  "${data.name}" recomputes to ${recomputed === null ? "no score" : recomputed}`
      );
    }
  }

  finish();
}

/**
 * Runs the real engine over the raw stored values: scoreJury per jury, then
 * scoreParticipant over the results — the same two-step the app performs, but
 * driven straight from Firestore documents rather than from app state.
 */
function recompute(
  config: EventEvaluationConfigV2,
  questionCount: number,
  juries: Array<{
    juryId: string;
    questionValues: Map<number, QuestionValueMap>;
    adjustmentValues: AdjustmentValueMap;
  }>
): number | null {
  const assignedQuestionNumbers = Array.from(
    { length: questionCount },
    (_, index) => index + 1
  );

  const juryResults = new Map<string, JuryScoreResult>();
  for (const jury of juries) {
    const result = scoreJury(
      config,
      assignedQuestionNumbers,
      jury.questionValues,
      jury.adjustmentValues
    );
    if (!result.ok) {
      // An incomplete jury is omitted from the average — the same rule
      // useParticipants applies. Reported so a silently dropped jury is
      // visible here rather than only as a lower final score.
      console.log(
        `  INFO  jury "${jury.juryId}" omitted: ${result.errors.join("; ")}`
      );
      continue;
    }
    juryResults.set(jury.juryId, result.value);
  }

  if (juryResults.size === 0) return null;
  const participantResult = scoreParticipant(juryResults);
  if (!participantResult.ok) {
    console.log(
      `  INFO  engine refused to aggregate: ${participantResult.errors.join("; ")}`
    );
    return null;
  }
  return participantResult.value;
}

function finish(): void {
  console.log(
    `\n${failures === 0 ? "OK" : "FAILED"}: ${checks - failures}/${checks} checks passed`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("verification crashed:", error);
  process.exit(1);
});
