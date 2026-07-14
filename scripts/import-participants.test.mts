import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase/firestore";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { buildExampleEvaluationConfig } from "../src/evaluation/exampleConfigSeed";
import type { EventEvaluationConfigV2 } from "../src/evaluation/types";
import {
  CSV_COLUMNS,
  argumentFailureReport,
  buildImportPlan,
  buildReadableName,
  checkExistingParticipants,
  duplicateIdIssues,
  firestoreAppName,
  formatImportReport,
  generateParticipantId,
  initializeEmulatorFirestore,
  loadPhotoBase64,
  parseCliArgs,
  parseSpreadsheet,
  resolveCountry,
  runImport,
  transformRow,
  type ParsedCsvRow,
} from "./import-participants.mts";

let config: EventEvaluationConfigV2;
const temporaryDirectories: string[] = [];

beforeAll(async () => {
  config = await buildExampleEvaluationConfig(
    Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"))
  );
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

function validRow(overrides: Partial<Record<string, string>> = {}): ParsedCsvRow {
  return {
    rowNumber: 2,
    values: {
      [CSV_COLUMNS.firstName]: "Amina",
      [CSV_COLUMNS.lastName]: "Rahman",
      [CSV_COLUMNS.lockedName]: "AMINA_RAHMAN",
      [CSV_COLUMNS.age]: "14",
      [CSV_COLUMNS.country]: "Portugal.png",
      [CSV_COLUMNS.category]: "CAT_A",
      [CSV_COLUMNS.scheduled]: "S1",
      [CSV_COLUMNS.photo]: "",
      ...overrides,
    },
  };
}

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "participant-import-unit-"));
  temporaryDirectories.push(directory);
  return directory;
}

function verifiedFirestore(getAll = vi.fn()) {
  const descriptor = {
    schemaVersion: 2,
    mode: "jury-first-v2",
    configVersion: config.configVersion,
    configPath: "events/demo-2026/app_config/evaluation",
    contentHash: config.contentHash,
    scoringFingerprint: config.scoringFingerprint,
    provisionedBy: "offline-admin-sdk",
    provisionedAt: config.provisionedAt,
  };
  return {
    getAll,
    doc: (documentPath: string) => ({
      id: documentPath.split("/").at(-1),
      get: async () => ({
        exists: true,
        data: () => documentPath === "events/demo-2026"
          ? { evaluation: descriptor }
          : config,
      }),
    }),
  } as unknown as Firestore;
}

describe("participant importer arguments", () => {
  test("requires an event, defaults to dry-run, and resolves the default file", () => {
    expect(() => parseCliArgs([], { usingEmulator: true })).toThrow(
      "Missing required argument"
    );

    const args = parseCliArgs(
      ["--event", "demo-2026", "--project", "demo-fip-hifz"],
      {
        cwd: "/tmp/example",
        usingEmulator: true,
      }
    );
    expect(args.apply).toBe(false);
    expect(args.event).toBe("demo-2026");
    expect(args.project).toBe("demo-fip-hifz");
    expect(args.file.endsWith("scripts/participants.csv")).toBe(true);
  });

  test("requires --apply for writes and rejects ambiguous arguments", () => {
    expect(
      parseCliArgs(
        [
          "--event",
          "demo-2026",
          "--file",
          "people.csv",
          "--project",
          "demo-project",
          "--apply",
        ],
        { cwd: "/tmp/example", usingEmulator: true }
      )
    ).toEqual({
      event: "demo-2026",
      file: "/tmp/example/people.csv",
      project: "demo-project",
      apply: true,
    });

    expect(() =>
      parseCliArgs(["--event", "demo", "--event", "other"], {
        usingEmulator: true,
      })
    ).toThrow("Duplicate argument");
    expect(() =>
      parseCliArgs(["--event", "demo", "--unknown"], {
        usingEmulator: true,
      })
    ).toThrow("Unknown argument");
    expect(() =>
      parseCliArgs(["--event", "events/demo"], { usingEmulator: true })
    ).toThrow("Invalid Firestore event document ID");
    expect(() =>
      parseCliArgs(["--event", "__reserved__"], { usingEmulator: true })
    ).toThrow("Invalid Firestore event document ID");
  });

  test("keeps the full Firestore byte budget for event IDs", () => {
    const eventId = "e".repeat(1_500);
    expect(parseCliArgs(["--event", eventId], { usingEmulator: true }).event).toBe(eventId);
    expect(() =>
      parseCliArgs(["--event", `${eventId}e`], { usingEmulator: true })
    ).toThrow("Invalid Firestore event document ID");
  });

  test("formats argument failures through the deterministic blocked report", () => {
    const report = argumentFailureReport(
      ["--event", "demo-2026", "--project", "demo-fip-hifz", "--unknown", "--apply"],
      new Error("Unknown argument: --unknown"),
      { cwd: "/tmp/example", usingEmulator: true }
    );
    expect(report).toMatchObject({
      event: "demo-2026",
      project: "demo-fip-hifz",
      target: expect.stringMatching(/^(production|emulator:)/),
      destinationPath: "events/demo-2026/participants",
      mode: "apply",
      outcome: "blocked",
      issues: [{ scope: "arguments", message: "Unknown argument: --unknown" }],
    });
    expect(formatImportReport(report)).toContain("outcome: blocked");
  });

  test("uses distinct Admin apps for production and each emulator target", () => {
    const originalHost = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      const productionName = firestoreAppName("demo-fip-hifz");
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      const firstEmulatorName = firestoreAppName("demo-fip-hifz");
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:9090";
      const secondEmulatorName = firestoreAppName("demo-fip-hifz");
      expect(new Set([productionName, firstEmulatorName, secondEmulatorName]).size).toBe(3);
    } finally {
      if (originalHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = originalHost;
    }
  });

  test("reports the resolved production or emulator destination", () => {
    const originalHost = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      const production = argumentFailureReport(
        ["--event", "demo-2026", "--project", "demo-fip-hifz"],
        new Error("test")
      );
      expect(production.target).toBe("production");
      expect(formatImportReport(production)).toContain("target: production");

      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      const emulator = argumentFailureReport(
        ["--event", "demo-2026", "--project", "demo-fip-hifz"],
        new Error("test")
      );
      expect(emulator.target).toBe("emulator:127.0.0.1:8080");
      expect(formatImportReport(emulator)).toContain(
        "destinationPath: events/demo-2026/participants"
      );
    } finally {
      if (originalHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = originalHost;
    }
  });

  test("refuses emulator-only Admin initialization without an explicit safe target", () => {
    const originalHost = process.env.FIRESTORE_EMULATOR_HOST;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      expect(() => initializeEmulatorFirestore("demo-fip-hifz")).toThrow(
        "FIRESTORE_EMULATOR_HOST must be set"
      );
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
      expect(() => initializeEmulatorFirestore("production-project")).toThrow(
        "is not allowed for emulator tests"
      );
    } finally {
      if (originalHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = originalHost;
    }
  });

  test("verifies the event descriptor before reading the spreadsheet", async () => {
    const reads: string[] = [];
    const db = {
      doc: (documentPath: string) => ({
        get: async () => {
          reads.push(documentPath);
          return { exists: true, data: () => ({}) };
        },
      }),
    } as unknown as Firestore;

    const report = await runImport(
      {
        event: "demo-2026",
        file: "/does/not/exist.csv",
        project: "demo-fip-hifz",
        apply: false,
      },
      db
    );

    expect(reads).toEqual(["events/demo-2026"]);
    expect(report.issues).toEqual([
      {
        scope: "config",
        message: 'event "demo-2026" has a missing or malformed evaluation descriptor',
      },
    ]);
  });
});

describe("participant row normalization", () => {
  test("prefers readable first/last names and cleans the locked fallback", () => {
    expect(buildReadableName("  Amina ", " Rahman  ", "LOCKED_NAME")).toBe(
      "Amina Rahman"
    );
    expect(buildReadableName("", "", "  MARYAM__ALI  ")).toBe("MARYAM ALI");
  });

  test("generates deterministic Unicode-aware IDs", () => {
    expect(generateParticipantId("Ámina Rahman")).toBe("amina_rahman");
    expect(generateParticipantId("يوسف بن علي")).toBe("يوسف_بن_علي");
    expect(generateParticipantId("---")).toBe("");
  });

  test("rejects generated IDs beyond Firestore's document ID limit", async () => {
    const result = await transformRow(
      validRow({ [CSV_COLUMNS.firstName]: "a".repeat(1_501) }),
      config,
      "/tmp/participants.csv"
    );
    expect(result.participant).toBeUndefined();
    expect(result.issues.map((issue) => issue.message)).toContain(
      "participant name does not produce a valid Firestore document ID"
    );
  });

  test("uses only canonical shared country data", () => {
    expect(resolveCountry("guinea-bissau.png")).toEqual({
      name: "Guinea-Bissau",
      flag: "🇬🇼",
    });
    expect(resolveCountry("PORTUGAL")).toEqual({ name: "Portugal", flag: "🇵🇹" });
    expect(resolveCountry("  Portugal.png  ")).toEqual({
      name: "Portugal",
      flag: "🇵🇹",
    });
    expect(resolveCountry("Portugal.webp")).toEqual({
      name: "Portugal",
      flag: "🇵🇹",
    });
    expect(resolveCountry("Portugal.jpg")).toEqual({
      name: "Portugal",
      flag: "🇵🇹",
    });
    expect(resolveCountry("Portugal.svg")).toEqual({
      name: "Portugal",
      flag: "🇵🇹",
    });
    expect(resolveCountry("Portugal.jxl")).toBeUndefined();
    expect(resolveCountry("Portugal.txt")).toBeUndefined();
    expect(resolveCountry("Portugal.exe")).toBeUndefined();
    expect(resolveCountry("Port")).toBeUndefined();
  });

  test.each(["Portugal.txt", "Portugal.exe"])(
    "rejects a non-image country suffix as a row error: %s",
    async (countryValue) => {
      const result = await transformRow(
        validRow({ [CSV_COLUMNS.country]: countryValue }),
        config,
        "/tmp/participants.csv"
      );

      expect(result.participant).toBeUndefined();
      expect(result.issues).toContainEqual({
        scope: "row",
        rowNumber: 2,
        message: "country must exactly match a recognized shared country",
      });
    }
  );

  test("requires an exact event category ID without case folding", async () => {
    const result = await transformRow(
      validRow({ [CSV_COLUMNS.category]: "cat_a" }),
      config,
      "/tmp/participants.csv"
    );

    expect(result.participant).toBeUndefined();
    expect(result.issues).toEqual([
      {
        scope: "row",
        rowNumber: 2,
        message: "CATEGORY must exactly match an event category ID (CAT_A, CAT_B, CAT_M)",
      },
    ]);
  });

  test("creates canonical inactive and unassigned defaults without a photo", async () => {
    const result = await transformRow(validRow(), config, "/tmp/participants.csv");
    expect(result.issues).toEqual([]);
    expect(result.participant).toEqual({
      id: "amina_rahman",
      rowNumber: 2,
      data: {
        name: "Amina Rahman",
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
      },
    });
  });

  test("stores a readable photo as raw base64 and rejects unreadable references", async () => {
    const bytes = Buffer.from([0, 1, 2, 253, 254, 255]);
    const valid = await transformRow(
      validRow({ [CSV_COLUMNS.photo]: "portrait.jpg" }),
      config,
      "/tmp/participants.csv",
      async (filePath) => {
        expect(filePath).toBe("/tmp/portrait.jpg");
        return bytes;
      }
    );
    expect(valid.participant?.data.photo).toBe(bytes.toString("base64"));
    expect(valid.participant?.data.photo).not.toContain("data:");

    const invalid = await transformRow(
      validRow({ [CSV_COLUMNS.photo]: "missing.jpg" }),
      config,
      "/tmp/participants.csv",
      async () => {
        throw new Error("ENOENT");
      }
    );
    expect(invalid.participant).toBeUndefined();
    expect(invalid.issues[0].message).toContain("unable to read photo");

    const empty = await transformRow(
      validRow({ [CSV_COLUMNS.photo]: "empty.jpg" }),
      config,
      "/tmp/participants.csv",
      async () => Buffer.alloc(0)
    );
    expect(empty.participant).toBeUndefined();
    expect(empty.issues[0].message).toContain("photo file is empty");
  });

  test("rejects photos that would exceed Firestore size limits during planning", async () => {
    const accepted = await transformRow(
      validRow({ [CSV_COLUMNS.photo]: "accepted.jpg" }),
      config,
      "/tmp/participants.csv",
      async () => Buffer.alloc(785_000)
    );
    expect(accepted.issues).toEqual([]);
    expect(accepted.participant?.data.photo).toHaveLength(1_046_668);

    const rejected = await transformRow(
      validRow({ [CSV_COLUMNS.photo]: "rejected.jpg" }),
      config,
      "/tmp/participants.csv",
      async () => Buffer.alloc(786_300)
    );
    expect(rejected.participant).toBeUndefined();
    expect(rejected.issues).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        message: expect.stringContaining("Firestore's"),
      }),
    ]);
  });

  test("includes the destination path and write-time timestamps in document sizing", async () => {
    const longId = "a".repeat(1_300);
    const result = await transformRow(
      validRow({
        [CSV_COLUMNS.firstName]: longId,
        [CSV_COLUMNS.lastName]: "",
        [CSV_COLUMNS.lockedName]: "",
        [CSV_COLUMNS.photo]: "near-limit.jpg",
      }),
      config,
      "/tmp/participants.csv",
      async () => Buffer.alloc(784_362),
      "e".repeat(1_500)
    );

    expect(result.participant).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        message: expect.stringContaining("document limit"),
      }),
    ]);
  });

  test("rejects an oversized photo before loading its contents", async () => {
    const directory = await makeTempDirectory();
    const photoPath = path.join(directory, "oversized.jpg");
    const handle = await open(photoPath, "w");
    await handle.truncate(1_000_000_000);
    await handle.close();

    await expect(loadPhotoBase64(
      path.join(directory, "participants.csv"),
      "oversized.jpg"
    )).rejects.toThrow("raw file limit");
  });

  test("reports every strict row error without legacy guesses", async () => {
    const result = await transformRow(
      validRow({
        [CSV_COLUMNS.firstName]: "",
        [CSV_COLUMNS.lastName]: "",
        [CSV_COLUMNS.lockedName]: "",
        [CSV_COLUMNS.age]: "0",
        [CSV_COLUMNS.country]: "Unknownland",
        [CSV_COLUMNS.category]: "A1",
      }),
      config,
      "/tmp/participants.csv"
    );
    expect(result.participant).toBeUndefined();
    expect(result.issues.map((issue) => issue.message)).toEqual([
      "participant name is required",
      "participant name does not produce a valid Firestore document ID",
      "AGE ON EVENT must be a positive integer",
      "country must exactly match a recognized shared country",
      "CATEGORY must exactly match an event category ID (CAT_A, CAT_B, CAT_M)",
    ]);
    expect(result.rowResult).toEqual({ rowNumber: 2, status: "invalid" });
  });
});

describe("spreadsheet and collision planning", () => {
  test("parses xlsx-supported CSV, retains row numbers, and ignores blank rows", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      `${headers}\nAmina,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1,\n,,,,,,,\n`,
      "utf8"
    );

    expect(parseSpreadsheet(csvPath)).toEqual({
      rows: [validRow()],
      rowsRead: 1,
      rowResults: [],
      issues: [],
    });
  });

  test("detects semicolon-delimited CSV with an Excel sep directive", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(";");
    await writeFile(
      csvPath,
      `sep=;\n${headers}\nAmina;Rahman;AMINA_RAHMAN;14;Portugal.png;CAT_A;S1;\n`,
      "utf8"
    );

    expect(parseSpreadsheet(csvPath)).toEqual({
      rows: [{ ...validRow(), rowNumber: 3 }],
      rowsRead: 1,
      rowResults: [],
      issues: [],
    });
  });

  test("preserves literal CSV text and accepts an Excel-style UTF-8 BOM", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      `${String.fromCharCode(0xfeff)}${headers}\nAmina,Rahman,AMINA_RAHMAN,014,Portugal.png,CAT_A,2026-01-01,=PHOTO()\n`,
      "utf8"
    );

    const [row] = parseSpreadsheet(csvPath).rows;
    expect(row.values[CSV_COLUMNS.age]).toBe("014");
    expect(row.values[CSV_COLUMNS.scheduled]).toBe("2026-01-01");
    expect(row.values[CSV_COLUMNS.photo]).toBe("=PHOTO()");
  });

  test("rejects invalid UTF-8 as an unrecoverable file error", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      Buffer.concat([Buffer.from(`${headers}\n`, "utf8"), Buffer.from([0xc3, 0x28])])
    );

    expect(() => parseSpreadsheet(csvPath)).toThrow("CSV is not valid UTF-8");
  });

  test.each([
    '"Amina"junk,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1,',
    '"Amina,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1,',
    'Ami"na,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1,',
  ])("rejects malformed CSV quoting: %s", async (dataRow) => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(csvPath, `${headers}\n${dataRow}\n`, "utf8");
    expect(() => parseSpreadsheet(csvPath)).toThrow("Malformed CSV quoting");
  });

  test("collects inconsistent CSV records as recoverable row errors", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      `${headers}\nAmina,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1\n`,
      "utf8"
    );
    expect(parseSpreadsheet(csvPath)).toEqual({
      rows: [],
      rowsRead: 1,
      rowResults: [{ rowNumber: 2, status: "invalid" }],
      issues: [{
        scope: "row",
        rowNumber: 2,
        message: "Malformed CSV row: expected 8 fields but found 7",
      }],
    });
  });

  test("ignores leading blank rows and preserves physical row numbers", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      `\n${headers}\nAmina,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1,\n`,
      "utf8"
    );

    expect(parseSpreadsheet(csvPath).rows).toEqual([{ ...validRow(), rowNumber: 3 }]);
  });

  test("requires the complete input header contract", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    await writeFile(csvPath, "FIRST NAME,LAST NAME\nAmina,Rahman\n", "utf8");
    expect(() => parseSpreadsheet(csvPath)).toThrow("Missing spreadsheet headers");
  });

  test("rejects duplicate deterministic IDs before collision reads", async () => {
    const plan = await buildImportPlan(
      [validRow(), { ...validRow(), rowNumber: 3 }],
      config,
      "/tmp/participants.csv"
    );
    expect(plan.participants).toHaveLength(2);
    expect(duplicateIdIssues(plan.participants)).toEqual([
      {
        scope: "collision",
        participantId: "amina_rahman",
        message: "duplicate planned participant ID on rows 2, 3",
      },
    ]);
    expect(plan.issues).toEqual(duplicateIdIssues(plan.participants));
  });

  test("reports duplicate IDs even when one involved row is otherwise invalid", async () => {
    const plan = await buildImportPlan(
      [
        validRow(),
        { ...validRow({ [CSV_COLUMNS.age]: "0" }), rowNumber: 3 },
      ],
      config,
      "/tmp/participants.csv"
    );

    expect(plan.participants).toHaveLength(1);
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowNumber: 3, message: "AGE ON EVENT must be a positive integer" }),
        {
          scope: "collision",
          participantId: "amina_rahman",
          message: "duplicate planned participant ID on rows 2, 3",
        },
      ])
    );
  });

  test("blocks an otherwise valid plan that approaches Firestore's 10 MiB commit limit", async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      ...validRow({
        [CSV_COLUMNS.firstName]: `Large Photo ${index + 1}`,
        [CSV_COLUMNS.lastName]: "",
        [CSV_COLUMNS.photo]: `photo-${index + 1}.jpg`,
      }),
      rowNumber: index + 2,
    }));
    const plan = await buildImportPlan(
      rows,
      config,
      "/tmp/participants.csv",
      async () => Buffer.alloc(785_000),
      "demo-2026"
    );
    expect(plan.participants).toHaveLength(0);
    expect(plan.participantsPlanned).toBe(11);
    expect(plan.issues).toEqual([
      expect.objectContaining({
        scope: "file",
        message: expect.stringContaining("estimated atomic commit size"),
      }),
    ]);
  });

  test("bounds photo reads and releases payloads after the commit limit blocks", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      ...validRow({
        [CSV_COLUMNS.firstName]: `Bounded Photo ${index + 1}`,
        [CSV_COLUMNS.lastName]: "",
        [CSV_COLUMNS.photo]: `photo-${index + 1}.jpg`,
        [CSV_COLUMNS.age]: index === 11 ? "0" : "14",
      }),
      rowNumber: index + 2,
    }));
    let activeReads = 0;
    let maxActiveReads = 0;

    const plan = await buildImportPlan(
      rows,
      config,
      "/tmp/participants.csv",
      async () => {
        activeReads++;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeReads--;
        return Buffer.alloc(785_000);
      },
      "demo-2026"
    );

    expect(maxActiveReads).toBe(1);
    expect(plan.participants).toHaveLength(0);
    expect(plan.participantsPlanned).toBe(11);
    expect(plan.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: "file",
        message: expect.stringContaining("estimated atomic commit size"),
      }),
      expect.objectContaining({
        scope: "row",
        rowNumber: 13,
        message: "AGE ON EVENT must be a positive integer",
      }),
    ]));
  });

  test("validates every row even when the file exceeds the atomic write limit", async () => {
    const rows = Array.from({ length: 501 }, (_, index) =>
      validRow({
        [CSV_COLUMNS.firstName]: `Person ${index + 1}`,
        [CSV_COLUMNS.lastName]: "",
        [CSV_COLUMNS.age]: index === 500 ? "0" : "14",
      })
    ).map((row, index) => ({ ...row, rowNumber: index + 2 }));

    const plan = await buildImportPlan(rows, config, "/tmp/participants.csv");
    expect(plan.participants).toHaveLength(0);
    expect(plan.participantsPlanned).toBe(500);
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "row",
          rowNumber: 502,
          message: "AGE ON EVENT must be a positive integer",
        }),
        expect.objectContaining({
          scope: "file",
          message: "spreadsheet has 501 rows; atomic imports are limited to 500",
        }),
      ])
    );
  });

  test("checks collisions with an empty field mask", async () => {
    const getAll = vi.fn(async (...arguments_: unknown[]) =>
      arguments_.slice(0, -1).map((reference) => ({
        id: (reference as { id: string }).id,
        exists: false,
      }))
    );
    const db = {
      doc: (documentPath: string) => ({ id: documentPath.split("/").at(-1) }),
      getAll,
    } as unknown as Firestore;

    await checkExistingParticipants(db, "demo-2026", [{
      id: "amina_rahman",
      rowNumber: 2,
      data: {} as never,
    }]);

    expect(getAll).toHaveBeenCalledWith(
      expect.objectContaining({ id: "amina_rahman" }),
      { fieldMask: [] }
    );
  });

  test("reports a malformed row and a later semantic error before collision reads", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      `${headers}\nMalformed,Row,ONLY\nAmina,Rahman,AMINA_RAHMAN,0,Portugal.png,CAT_A,S1,\n`,
      "utf8"
    );
    const getAll = vi.fn();

    const report = await runImport({
      event: "demo-2026",
      file: csvPath,
      project: "demo-fip-hifz",
      apply: true,
    }, verifiedFirestore(getAll));

    expect(report.rowsRead).toBe(2);
    expect(report.rowResults).toEqual([
      { rowNumber: 2, status: "invalid" },
      {
        rowNumber: 3,
        status: "invalid",
        participantId: "amina_rahman",
        name: "Amina Rahman",
      },
    ]);
    expect(report.issues).toEqual(expect.arrayContaining([
      {
        scope: "row",
        rowNumber: 2,
        message: "Malformed CSV row: expected 8 fields but found 3",
      },
      {
        scope: "row",
        rowNumber: 3,
        message: "AGE ON EVENT must be a positive integer",
      },
    ]));
    expect(getAll).not.toHaveBeenCalled();
  });

  test("reports an indeterminate outcome when the atomic commit throws", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      `${headers}\nAmina,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1,\n`,
      "utf8"
    );
    const getAll = vi.fn(async (...refs: Array<{ id: string }>) =>
      refs.slice(0, -1).map((reference) => ({ id: reference.id, exists: false }))
    );
    const commit = vi.fn(async () => {
      throw new Error("DEADLINE_EXCEEDED");
    });
    const base = verifiedFirestore(getAll) as unknown as Record<string, unknown>;
    const db = {
      ...base,
      batch: () => ({ create: vi.fn(), commit }),
    } as unknown as Firestore;

    const report = await runImport(
      { event: "demo-2026", file: csvPath, project: "demo-fip-hifz", apply: true },
      db
    );

    expect(commit).toHaveBeenCalledOnce();
    expect(report.outcome).toBe("indeterminate");
    expect(report.participantsWritten).toBe(0);
    expect(report.issues.some((issue) => issue.message.includes("may or may not"))).toBe(true);
  });

  test("rejects absolute and traversal photo paths as row issues", async () => {
    const absolute = await transformRow(
      validRow({ [CSV_COLUMNS.photo]: "/etc/passwd" }),
      config,
      "/tmp/participants.csv",
      async () => Buffer.from([1])
    );
    expect(absolute.participant).toBeUndefined();
    expect(absolute.issues[0].message).toContain("absolute");

    const traversal = await transformRow(
      validRow({ [CSV_COLUMNS.photo]: "../secret.json" }),
      config,
      "/tmp/participants.csv",
      async () => Buffer.from([1])
    );
    expect(traversal.participant).toBeUndefined();
    expect(traversal.issues[0].message).toContain("escapes");
  });

  test("rethrows systemic file errors instead of masking them as row issues", async () => {
    const emfile = Object.assign(new Error("too many open files"), { code: "EMFILE" });
    await expect(
      transformRow(
        validRow({ [CSV_COLUMNS.photo]: "portrait.jpg" }),
        config,
        "/tmp/participants.csv",
        async () => {
          throw emfile;
        }
      )
    ).rejects.toThrow("too many open files");
  });

  test("flags an all-empty but wrong-width CSV record instead of skipping it", async () => {
    const directory = await makeTempDirectory();
    const csvPath = path.join(directory, "participants.csv");
    const headers = Object.values(CSV_COLUMNS).join(",");
    await writeFile(
      csvPath,
      `${headers}\nAmina,Rahman,AMINA_RAHMAN,14,Portugal.png,CAT_A,S1,\n,,,\n`,
      "utf8"
    );
    const report = await runImport(
      { event: "demo-2026", file: csvPath, project: "demo-fip-hifz", apply: true },
      verifiedFirestore(vi.fn())
    );
    expect(report.outcome).toBe("blocked");
    expect(
      report.issues.some((issue) => issue.message.includes("expected 8 fields but found 4"))
    ).toBe(true);
  });

  test("skips destination reads when row, duplicate, or file-limit validation blocks", async () => {
    const directory = await makeTempDirectory();
    const headers = Object.values(CSV_COLUMNS).join(",");
    const row = (firstName: string, age = "14") =>
      `${firstName},Rahman,${firstName}_RAHMAN,${age},Portugal.png,CAT_A,S1,`;
    const cases = [
      ["invalid.csv", `${headers}\n${row("Invalid", "0")}\n`],
      ["duplicate.csv", `${headers}\n${row("Duplicate")}\n${row("Duplicate")}\n`],
      [
        "too-many.csv",
        `${headers}\n${Array.from({ length: 501 }, (_, index) => row(`Person${index + 1}`)).join("\n")}\n`,
      ],
    ] as const;

    for (const [fileName, contents] of cases) {
      const csvPath = path.join(directory, fileName);
      await writeFile(csvPath, contents, "utf8");
      const getAll = vi.fn();
      const report = await runImport({
        event: "demo-2026",
        file: csvPath,
        project: "demo-fip-hifz",
        apply: true,
      }, verifiedFirestore(getAll));
      expect(report.outcome).toBe("blocked");
      expect(getAll).not.toHaveBeenCalled();
    }
  });

  test("formats reports deterministically", () => {
    const output = formatImportReport({
      event: "demo-2026",
      project: "demo-fip-hifz",
      target: "production",
      destinationPath: "events/demo-2026/participants",
      file: "/tmp/participants.csv",
      mode: "dry-run",
      configVersion: "v2",
      contentHash: "hash",
      scoringFingerprint: "fingerprint",
      rowsRead: 2,
      rowResults: [
        { rowNumber: 4, status: "invalid" },
        {
          rowNumber: 2,
          status: "planned",
          participantId: "amina_rahman",
          name: "Amina Rahman",
        },
      ],
      collisionResults: [
        { participantId: "ä", status: "clear" },
        { participantId: "z", status: "clear" },
        { participantId: "amina_rahman", status: "clear" },
      ],
      participantsPlanned: 1,
      participantsWritten: 0,
      issues: [
        { scope: "row", rowNumber: 4, message: "later" },
        { scope: "row", rowNumber: 2, message: "earlier" },
      ],
      outcome: "blocked",
    });
    expect(output.indexOf("row 2")).toBeLessThan(output.indexOf("row 4"));
    expect(output.indexOf("id z: clear")).toBeLessThan(output.indexOf("id ä: clear"));
    expect(output).toContain("outcome: blocked");
  });
});
