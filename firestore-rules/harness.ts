import { readFileSync } from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, type Firestore } from "firebase/firestore";

/**
 * Harness for the firestore.rules unit tests.
 *
 * These tests run against a DEDICATED emulator on port 8085 (firebase.rules.json)
 * so they never collide with the e2e emulator on 8080 or the interactive
 * journey emulator on 8082. (8081 is deliberately avoided — it is occupied by
 * an unrelated local service on at least one dev machine.)
 *
 * Every context here is UNAUTHENTICATED, because the ruleset makes no identity
 * assertions — auth is deferred. The contract under test is document SHAPE and
 * path reachability, not who is asking.
 */

const PROJECT_ID = "demo-fip-hifz-rules";

/**
 * RULES_FILE exists so the suite's teeth can be verified: pointing it at a
 * permissive ruleset MUST make a large number of these tests fail. A rules
 * suite that passes against allow-all is testing nothing.
 *   RULES_FILE=firestore-rules/allow-all.fixture.rules npm run test:rules
 */
const RULES_PATH = path.resolve(
  __dirname,
  "..",
  process.env.RULES_FILE ?? "firestore.rules"
);

let cached: RulesTestEnvironment | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (cached) return cached;
  cached = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8085,
      rules: readFileSync(RULES_PATH, "utf8"),
    },
  });
  return cached;
}

export async function teardownTestEnv(): Promise<void> {
  if (!cached) return;
  await cached.cleanup();
  cached = null;
}

/** A client subject to the rules — this is what the app is. */
export async function db(): Promise<Firestore> {
  const env = await getTestEnv();
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

/** Seeds fixture data with rules bypassed, the way the Admin SDK does. */
export async function seed(
  fn: (db: Firestore) => Promise<void>
): Promise<void> {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

export async function clearData(): Promise<void> {
  const env = await getTestEnv();
  await env.clearFirestore();
}

// ---------- canonical fixture documents ----------
//
// These mirror what the app and the production data actually contain. Tests
// mutate a spread copy so a field-level violation is expressed as a one-line
// override and the reader can see exactly what is being violated.

export const EVENT_ID = "rules-test-event";

export const CONFIG_VERSION = "rules-test-config-v1";
export const CONTENT_HASH = "a".repeat(64);
export const SCORING_FINGERPRINT = "b".repeat(64);

export const descriptor = {
  schemaVersion: 2,
  mode: "jury-first-v2",
  configVersion: CONFIG_VERSION,
  configPath: `events/${EVENT_ID}/app_config/evaluation`,
  contentHash: CONTENT_HASH,
  scoringFingerprint: SCORING_FINGERPRINT,
  provisionedBy: "in-app-editor",
  provisionedAt: Timestamp.fromMillis(1_760_000_000_000),
};

export const eventDoc = {
  name: "Rules Test Event",
  status: "active",
  description: "fixture",
  createdAt: Timestamp.fromMillis(1_760_000_000_000),
  evaluation: descriptor,
};

export const evaluationConfig = {
  schemaVersion: 2,
  configVersion: CONFIG_VERSION,
  algorithmVersion: "jury-first-v2",
  contentHash: CONTENT_HASH,
  scoringFingerprint: SCORING_FINGERPRINT,
  provisionedAt: Timestamp.fromMillis(1_760_000_000_000),
  scoring: {
    baseScorePerQuestion: 100,
    questionBounds: { min: 0, max: 105 },
    finalBounds: { min: 0, max: 110 },
    rounding: "ecmascript-math-round",
    outputDecimals: 2,
    missingQuestionPolicy: "incompleteEvaluation",
  },
  categories: {
    CAT_A: {
      id: "CAT_A",
      label: { default: "CAT_A" },
      order: 1,
      questionCount: 2,
      questionSlots: [
        { questionNumber: 1, pageRange: { startPage: 3, endPage: 51 } },
        { questionNumber: 2, pageRange: { startPage: 52, endPage: 101 } },
      ],
    },
  },
  questionTypes: {
    hifdh: {
      id: "hifdh",
      label: { default: "Hifdh" },
      order: 1,
      operation: "subtract",
      perSectionDeductionCap: 50,
      inputCount: 1,
      inputs: [
        {
          id: "judge_correction",
          label: { default: "Judge Correction" },
          order: 1,
          role: "scored",
          control: "integerCounter",
          min: 0,
          max: 10,
          step: 1,
          perInputWeight: 3,
        },
      ],
    },
  },
  overrideRules: [],
  participantAdjustments: {},
};

/**
 * The 13 fields present on all 206 production participant documents, plus the
 * optional ones the app writes. Legacy documents lack evaluationStarted and
 * usually createdAt — that is the case the required-field list must tolerate.
 */
export const participantDoc = {
  name: "Amina Rahman",
  age: 15,
  country: "Egypt",
  category: "CAT_A",
  school: "Demo Quran School",
  scheduled: "1",
  isDone: false,
  isActive: true,
  flag: "🇪🇬",
  parentsName: "Demo Parent",
  phoneNum: "+000000000",
  assignedQuestions: [27, 76],
  activeQuestion: 27,
};

/** A production-shaped legacy participant: no evaluationStarted, no createdAt. */
export const legacyParticipantDoc = {
  ...participantDoc,
  email: "legacy@example.com",
  photo: "data:image/png;base64,AAAA",
  updatedAt: Timestamp.fromMillis(1_700_000_000_000),
};

export const juryDoc = {
  name: "Demo Jury One",
  currentQuestion: 1,
  hasFinishedEvaluating: false,
  isActive: true,
};

export const JURY_ID = "demo-jury-one";
export const PARTICIPANT_ID = "amina-rahman";

export const scoreDoc = {
  schemaVersion: 2,
  participantId: PARTICIPANT_ID,
  juryId: JURY_ID,
  questionNumber: 1,
  pageNumber: 27,
  categoryId: "CAT_A",
  configVersion: CONFIG_VERSION,
  scoringFingerprint: SCORING_FINGERPRINT,
  algorithmVersion: "jury-first-v2",
  assignmentHash: "c".repeat(64),
  values: { hifdh: { judge_correction: 1 } },
  source: { kind: "nativeV2" },
};

export const juryInputsDoc = {
  schemaVersion: 2,
  participantId: PARTICIPANT_ID,
  juryId: JURY_ID,
  categoryId: "CAT_A",
  configVersion: CONFIG_VERSION,
  scoringFingerprint: SCORING_FINGERPRINT,
  algorithmVersion: "jury-first-v2",
  assignmentHash: "c".repeat(64),
  values: { overall_bonus: { bonus: 2 } },
  source: { kind: "nativeV2" },
};

/** Seeds a complete, scorable event: descriptor, config, participant, jury. */
export async function seedEvent(overrides?: {
  event?: Record<string, unknown>;
}): Promise<void> {
  const { doc, setDoc } = await import("firebase/firestore");
  await seed(async (d) => {
    await setDoc(doc(d, "events", EVENT_ID), {
      ...eventDoc,
      ...(overrides?.event ?? {}),
    });
    await setDoc(
      doc(d, "events", EVENT_ID, "app_config", "evaluation"),
      evaluationConfig
    );
    await setDoc(
      doc(d, "events", EVENT_ID, "participants", PARTICIPANT_ID),
      participantDoc
    );
    await setDoc(doc(d, "events", EVENT_ID, "jury", JURY_ID), {
      ...juryDoc,
      id: JURY_ID,
    });
  });
}
