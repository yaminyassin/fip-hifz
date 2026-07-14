import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import {
  CSV_COLUMNS,
  applyImportPlan,
  initializeEmulatorFirestore,
} from "../scripts/import-participants.mts";
import { getEmulatorFirestore } from "./firestoreTestClient";

const EVENT_ID = "demo-2026";
const PROJECT_ID = "demo-fip-hifz";
const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEST_IDS = [
  "import_amina_rahman",
  "import_bilal_khan",
  "import_maryam_ali",
  "invalid_valid_person",
  "invalid_bad_person",
  "collision_existing_person",
  "collision_new_person",
  "late_collision_existing",
  "late_collision_other",
];

function csvLine(values: readonly string[]): string {
  return values
    .map((value) => `"${value.replaceAll('"', '""')}"`)
    .join(",");
}

async function writeParticipantCsv(
  directory: string,
  fileName: string,
  rows: readonly (readonly string[])[]
): Promise<string> {
  const filePath = path.join(directory, fileName);
  const contents = [csvLine(Object.values(CSV_COLUMNS)), ...rows.map(csvLine)].join("\n");
  await writeFile(filePath, `${contents}\n`, "utf8");
  return filePath;
}

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runImporterCli(file: string, apply = false): Promise<CliResult> {
  const cliArguments = [
    "run",
    "insert-participants",
    "--",
    "--event",
    EVENT_ID,
    "--file",
    file,
    "--project",
    PROJECT_ID,
    ...(apply ? ["--apply"] : []),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn("npm", cliArguments, {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function participantRow(
  firstName: string,
  lastName: string,
  age: string,
  country: string,
  category: string,
  schedule: string,
  photo = ""
): string[] {
  return [
    firstName,
    lastName,
    `${firstName}_${lastName}`,
    age,
    country,
    category,
    schedule,
    photo,
  ];
}

async function deleteTestParticipants(): Promise<void> {
  const firestore = getEmulatorFirestore();
  await Promise.all(
    TEST_IDS.map((id) =>
      deleteDoc(doc(firestore, "events", EVENT_ID, "participants", id))
    )
  );
}

async function participantIds(): Promise<string[]> {
  const firestore = getEmulatorFirestore();
  const snapshot = await getDocs(
    collection(firestore, "events", EVENT_ID, "participants")
  );
  return snapshot.docs.map((document) => document.id).sort();
}

test("participant importer is dry-run by default, writes canonical documents atomically, and fails closed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "participant-import-e2e-"));
  const adminFirestore = initializeEmulatorFirestore(PROJECT_ID);
  const firestore = getEmulatorFirestore();

  try {
    await deleteTestParticipants();
    const photoBytes = Buffer.from([0, 1, 2, 253, 254, 255]);
    await writeFile(path.join(directory, "maryam.jpg"), photoBytes);
    const validCsv = await writeParticipantCsv(directory, "valid.csv", [
      participantRow("Import Amina", "Rahman", "14", "Portugal", "CAT_A", "S1"),
      participantRow("Import Bilal", "Khan", "15", "Pakistan.png", "CAT_B", "S2"),
      participantRow("Import Maryam", "Ali", "16", "Morocco", "CAT_M", "S3", "maryam.jpg"),
    ]);

    const beforeDryRun = await participantIds();
    const legacyResult = await runImporterCli(
      path.resolve(process.cwd(), "scripts/participants.csv")
    );
    expect(legacyResult.exitCode).toBe(1);
    expect(legacyResult.stdout).toContain("outcome: blocked");
    expect(legacyResult.stdout).toContain("AGE ON EVENT must be a positive integer");
    expect(legacyResult.stdout).toContain("country must exactly match a recognized shared country");
    expect(legacyResult.stdout).toContain("CATEGORY must exactly match");
    expect(await participantIds()).toEqual(beforeDryRun);

    const dryRunResult = await runImporterCli(validCsv);
    expect(dryRunResult.exitCode).toBe(0);
    expect(dryRunResult.stdout).toContain("outcome: dry-run-valid");
    expect(dryRunResult.stdout).toContain(
      "configPath: events/demo-2026/app_config/evaluation"
    );
    expect(dryRunResult.stdout).toContain("schemaVersion: 2");
    expect(dryRunResult.stdout).toContain("algorithmVersion: jury-first-v2");
    expect(dryRunResult.stdout).toMatch(/contentHash: [a-f0-9]{64}/);
    expect(dryRunResult.stdout).toMatch(/scoringFingerprint: .+/);
    expect(dryRunResult.stdout).toContain("participantsPlanned: 3");
    expect(dryRunResult.stdout).toContain("participantsWritten: 0");
    expect(await participantIds()).toEqual(beforeDryRun);

    const applyResult = await runImporterCli(validCsv, true);
    expect(applyResult.exitCode).toBe(0);
    expect(applyResult.stdout).toContain("outcome: applied");
    expect(applyResult.stdout).toContain("participantsWritten: 3");

    const amina = await getDoc(
      doc(firestore, "events", EVENT_ID, "participants", "import_amina_rahman")
    );
    expect(amina.data()).toMatchObject({
      name: "Import Amina Rahman",
      age: 14,
      country: "Portugal",
      category: "CAT_A",
      school: "",
      scheduled: "S1",
      isDone: false,
      isActive: false,
      flag: "🇵🇹",
      parentsName: "",
      phoneNum: "",
      email: "",
      assignedQuestions: [],
      activeQuestion: 0,
    });
    expect(amina.data()?.photo).toBeUndefined();
    expect(amina.data()?.createdAt?.toMillis()).toBeGreaterThan(0);
    expect(amina.data()?.updatedAt?.toMillis()).toBeGreaterThan(0);

    const bilal = await getDoc(
      doc(firestore, "events", EVENT_ID, "participants", "import_bilal_khan")
    );
    expect(bilal.data()).toMatchObject({
      name: "Import Bilal Khan",
      age: 15,
      country: "Pakistan",
      category: "CAT_B",
      scheduled: "S2",
      assignedQuestions: [],
      activeQuestion: 0,
    });

    const maryam = await getDoc(
      doc(firestore, "events", EVENT_ID, "participants", "import_maryam_ali")
    );
    expect(maryam.data()).toMatchObject({
      name: "Import Maryam Ali",
      age: 16,
      country: "Morocco",
      category: "CAT_M",
      scheduled: "S3",
      assignedQuestions: [],
      activeQuestion: 0,
      photo: photoBytes.toString("base64"),
    });
    expect(maryam.data()?.photo).not.toContain("data:");

    const invalidCsv = await writeParticipantCsv(directory, "invalid.csv", [
      participantRow("Invalid Valid", "Person", "18", "Portugal", "CAT_A", "S4"),
      participantRow("Invalid Bad", "Person", "0", "", "A1", "S5"),
    ]);
    const beforeInvalidImport = await participantIds();
    const invalidResult = await runImporterCli(invalidCsv, true);
    expect(invalidResult.exitCode).toBe(1);
    expect(invalidResult.stdout).toContain("outcome: blocked");
    expect(invalidResult.stdout).toContain("blockingIssues: 3");
    expect(await participantIds()).toEqual(beforeInvalidImport);

    await setDoc(
      doc(firestore, "events", EVENT_ID, "participants", "collision_existing_person"),
      { name: "pre-existing collision fixture" }
    );
    const collisionCsv = await writeParticipantCsv(directory, "collision.csv", [
      participantRow("Collision Existing", "Person", "17", "Portugal", "CAT_A", "S6"),
      participantRow("Collision New", "Person", "18", "Morocco", "CAT_M", "S7"),
    ]);
    const collisionResult = await runImporterCli(collisionCsv, true);
    expect(collisionResult.exitCode).toBe(1);
    expect(collisionResult.stdout).toContain("outcome: blocked");
    expect(collisionResult.stdout).toContain(
      "[collision] id collision_existing_person: participant document already exists"
    );
    expect(
      (
        await getDoc(
          doc(firestore, "events", EVENT_ID, "participants", "collision_new_person")
        )
      ).exists()
    ).toBe(false);

    await setDoc(
      doc(firestore, "events", EVENT_ID, "participants", "late_collision_existing"),
      { name: "occupied after preflight" }
    );
    const plannedData = {
      age: 17,
      country: "Portugal",
      category: "CAT_A",
      school: "",
      scheduled: "S8",
      isDone: false as const,
      isActive: false as const,
      flag: "🇵🇹",
      parentsName: "",
      phoneNum: "",
      email: "",
      assignedQuestions: [] as [],
      activeQuestion: 0 as const,
    };
    // The CLEAR participant is first and the colliding one second: a non-atomic
    // fail-fast writer would have created the clear doc before hitting the
    // collision, so asserting the clear doc was rolled back proves atomicity.
    await expect(
      applyImportPlan(adminFirestore, EVENT_ID, [
        {
          id: "late_collision_other",
          rowNumber: 2,
          data: { ...plannedData, name: "Late Collision Other" },
        },
        {
          id: "late_collision_existing",
          rowNumber: 3,
          data: { ...plannedData, name: "Late Collision Existing" },
        },
      ])
    ).rejects.toThrow();
    expect(
      (
        await getDoc(
          doc(firestore, "events", EVENT_ID, "participants", "late_collision_other")
        )
      ).exists()
    ).toBe(false);
  } finally {
    await deleteTestParticipants();
    await rm(directory, { recursive: true, force: true });
  }
});
