import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { canonicalStringify, sha256Hex } from "../src/evaluation/configHash";
import { loadEvaluationConfig } from "../src/evaluation/eventDescriptor";
import { SCORING_FINGERPRINT_FIELDS } from "../src/evaluation/types";
import type { EventEvaluationConfigV2 } from "../src/evaluation/types";
import { getEmulatorFirestore } from "./firestoreTestClient";

const EVENT_ID = "demo-2026";
const PROJECT_ID = "demo-fip-hifz";
const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The pre-change fingerprint: the raw scoring fields, with no semantic
 * projection. Reproduced here verbatim so the test can manufacture a genuinely
 * old-stamped event rather than a hand-waved one.
 */
async function legacyScoringFingerprint(
  config: EventEvaluationConfigV2
): Promise<string> {
  const input = Object.fromEntries(
    SCORING_FINGERPRINT_FIELDS.map((field) => [field, config[field]])
  );
  return sha256Hex(canonicalStringify(input));
}

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runRestampCli(apply: boolean): Promise<CliResult> {
  const args = [
    "tsx",
    "scripts/restamp-configs.mts",
    "--event",
    EVENT_ID,
    "--project",
    PROJECT_ID,
    ...(apply ? ["--apply"] : []),
  ];
  return new Promise((resolve) => {
    const child = spawn("npx", args, {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST:
          process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

async function readConfig(): Promise<EventEvaluationConfigV2> {
  const firestore = getEmulatorFirestore();
  const snapshot = await getDoc(
    doc(firestore, "events", EVENT_ID, "app_config", "evaluation")
  );
  return snapshot.data() as EventEvaluationConfigV2;
}

async function loadThroughRealLoader() {
  const firestore = getEmulatorFirestore();
  const eventSnapshot = await getDoc(doc(firestore, "events", EVENT_ID));
  return loadEvaluationConfig(EVENT_ID, {
    getEventDocument: async () => eventSnapshot.data(),
    getConfigDocument: async (path) => {
      const parts = path.split("/");
      const snapshot = await getDoc(
        doc(firestore, parts[0], parts[1], parts[2], parts[3])
      );
      return snapshot.exists() ? snapshot.data() : undefined;
    },
  });
}

test("restamp-configs repairs an event stamped under the old fingerprint algorithm, including its scores", async () => {
  const firestore = getEmulatorFirestore();
  const original = await readConfig();

  // ---- manufacture a genuinely pre-change event -------------------------
  const legacyFingerprint = await legacyScoringFingerprint(original);
  expect(
    legacyFingerprint,
    "the two algorithms must actually differ, or this test proves nothing"
  ).not.toBe(original.scoringFingerprint);

  const legacyConfigNoHash = {
    ...original,
    scoringFingerprint: legacyFingerprint,
  };
  // contentHash covers scoringFingerprint, so it moves too.
  const legacyContentHash = await sha256Hex(
    canonicalStringify({
      schemaVersion: legacyConfigNoHash.schemaVersion,
      configVersion: legacyConfigNoHash.configVersion,
      scoringFingerprint: legacyFingerprint,
      algorithmVersion: legacyConfigNoHash.algorithmVersion,
      scoring: legacyConfigNoHash.scoring,
      categories: legacyConfigNoHash.categories,
      questionTypes: legacyConfigNoHash.questionTypes,
      overrideRules: legacyConfigNoHash.overrideRules,
      participantAdjustments: legacyConfigNoHash.participantAdjustments,
    })
  );

  await setDoc(doc(firestore, "events", EVENT_ID, "app_config", "evaluation"), {
    ...legacyConfigNoHash,
    contentHash: legacyContentHash,
  });
  await updateDoc(doc(firestore, "events", EVENT_ID), {
    "evaluation.contentHash": legacyContentHash,
    "evaluation.scoringFingerprint": legacyFingerprint,
  });

  // The seeded score documents must carry the old fingerprint too, exactly as
  // they would have on a real pre-change deployment.
  const scoreIds = [
    "participant-done_jury-one_1",
    "participant-done_jury-one_2",
    "participant-ranking-done_jury-one_1",
    "participant-ranking-done_jury-one_2",
  ];
  for (const id of scoreIds) {
    await updateDoc(
      doc(firestore, "events", EVENT_ID, "evaluationScores", id),
      { scoringFingerprint: legacyFingerprint }
    );
  }
  await updateDoc(
    doc(
      firestore,
      "events",
      EVENT_ID,
      "juryEvaluationInputs",
      "participant-ranking-done_jury-one"
    ),
    { scoringFingerprint: legacyFingerprint }
  );

  // ---- it is now genuinely broken --------------------------------------
  const broken = await loadThroughRealLoader();
  expect(
    broken.status,
    "an event stamped under the old algorithm must fail closed"
  ).toBe("failClosed");

  // ---- dry run reports, writes nothing ---------------------------------
  const dryRun = await runRestampCli(false);
  expect(dryRun.exitCode).toBe(0);
  expect(dryRun.stdout).toContain("NEEDS RE-STAMP");
  expect(dryRun.stdout).toContain("score documents to migrate: 4");
  expect(dryRun.stdout).toContain("adjustments: 1");
  expect(dryRun.stdout).toContain("Re-run with --apply");

  const afterDryRun = await readConfig();
  expect(
    afterDryRun.scoringFingerprint,
    "a dry run must not write"
  ).toBe(legacyFingerprint);

  // ---- apply ------------------------------------------------------------
  const applied = await runRestampCli(true);
  expect(applied.exitCode).toBe(0);
  expect(applied.stdout).toContain("re-stamped and verified");

  const repaired = await readConfig();
  expect(repaired.scoringFingerprint).toBe(original.scoringFingerprint);
  expect(repaired.contentHash).toBe(original.contentHash);
  // provisionedAt is excluded from the hashes; rewriting it would destroy real
  // provenance, so the script must leave it alone.
  expect(repaired.provisionedAt).toEqual(original.provisionedAt);

  const loaded = await loadThroughRealLoader();
  expect(loaded.status).toBe("ready");

  // Scores must have moved with the config, or the ranking would silently
  // empty out — which is the whole failure this script exists to prevent.
  for (const id of scoreIds) {
    const snapshot = await getDoc(
      doc(firestore, "events", EVENT_ID, "evaluationScores", id)
    );
    expect(snapshot.data()?.scoringFingerprint).toBe(original.scoringFingerprint);
  }

  // ---- idempotent -------------------------------------------------------
  const second = await runRestampCli(false);
  expect(second.stdout).toContain("already stamped under the current algorithm");
  expect(second.stdout).toContain("Nothing to do.");
});

test("restamp-configs only touches documents carrying the config's own previous fingerprint", async () => {
  const firestore = getEmulatorFirestore();
  const original = await readConfig();
  const legacyFingerprint = await legacyScoringFingerprint(original);

  // The previous test left the event fully re-stamped, so its score documents
  // already carry the CURRENT fingerprint. Now roll only the CONFIG back to
  // the old algorithm. The scores are therefore stamped with something that is
  // neither the config's stored fingerprint nor anything the script is
  // migrating from — the same shape a score from an unrelated revision has.
  //
  // Re-stamping those would resurrect scores the engine may never have
  // computed under these rules, so the guard must leave them untouched.
  await updateDoc(doc(firestore, "events", EVENT_ID, "app_config", "evaluation"), {
    scoringFingerprint: legacyFingerprint,
  });

  const before = await getDoc(
    doc(firestore, "events", EVENT_ID, "evaluationScores", "participant-done_jury-one_1")
  );
  expect(before.data()?.scoringFingerprint).toBe(original.scoringFingerprint);

  const dryRun = await runRestampCli(false);
  expect(dryRun.exitCode).toBe(0);
  expect(dryRun.stdout).toContain("NEEDS RE-STAMP");
  expect(
    dryRun.stdout,
    "no document carries the config's stored fingerprint, so none should migrate"
  ).toContain("score documents to migrate: 0");
  // Not an exact count: earlier specs in the suite add score documents to this
  // shared event, so the total is order-dependent. What matters is that some
  // exist and none of them are being migrated.
  const leftAlone = Number(
    /left alone \(stale from a real revision\): (\d+)/.exec(dryRun.stdout)?.[1] ?? "0"
  );
  expect(leftAlone).toBeGreaterThan(0);

  await runRestampCli(true);

  const after = await getDoc(
    doc(firestore, "events", EVENT_ID, "evaluationScores", "participant-done_jury-one_1")
  );
  expect(after.data()?.scoringFingerprint).toBe(original.scoringFingerprint);
});
