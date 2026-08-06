#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import XLSX from "xlsx";
import { loadEvaluationConfig } from "../src/evaluation/eventDescriptor";
import type { EventEvaluationConfigV2 } from "../src/evaluation/types";
import { AVAILABLE_COUNTRIES } from "../src/lib/countryUtils";
import {
  generateParticipantId,
  participantIdValidationError,
} from "../src/lib/participantId";

const DEFAULT_FILE = fileURLToPath(new URL("./participants.csv", import.meta.url));
const MAX_ATOMIC_WRITES = 500;
const MAX_FIRESTORE_DOCUMENT_BYTES = 1_048_576;
const MAX_FIRESTORE_STRING_BYTES = 1_048_487;
const MAX_PHOTO_RAW_BYTES = Math.floor(MAX_FIRESTORE_STRING_BYTES / 4) * 3;
const FIRESTORE_DOCUMENT_OVERHEAD_BYTES = 32;
const FIRESTORE_DOCUMENT_NAME_OVERHEAD_BYTES = 16;
const FIRESTORE_TIMESTAMP_BYTES = 8;
const MAX_ATOMIC_COMMIT_ESTIMATED_BYTES = 9 * 1024 * 1024;
const COMMIT_BASE_OVERHEAD_BYTES = 4 * 1024;
const WRITE_OVERHEAD_BYTES = 512;

export const CSV_COLUMNS = {
  firstName: "FIRST NAME",
  lastName: "LAST NAME",
  lockedName: "🔒_FIRST_AND_LAST_NAME",
  age: "AGE ON EVENT",
  country: "🔒_FLAG_IMAGE",
  category: "CATEGORY",
  scheduled: "SLOT SCHEDULE",
  photo: "🔒_PARTICIPANT_PHOTO",
} as const;

const REQUIRED_COLUMNS = Object.values(CSV_COLUMNS);

type CsvColumn = (typeof REQUIRED_COLUMNS)[number];

export interface CliArgs {
  event: string;
  file: string;
  project: string;
  apply: boolean;
}

export interface ParsedCsvRow {
  rowNumber: number;
  values: Record<CsvColumn, string>;
}

export interface ParsedSpreadsheet {
  rows: ParsedCsvRow[];
  rowsRead: number;
  rowResults: ImportRowResult[];
  issues: ImportIssue[];
}

export interface ParticipantDocument {
  name: string;
  age: number;
  country: string;
  category: string;
  school: string;
  scheduled: string;
  isDone: false;
  isActive: false;
  flag: string;
  parentsName: string;
  phoneNum: string;
  email: string;
  photo?: string;
  assignedQuestions: [];
  activeQuestion: 0;
}

export interface ParticipantIdCandidate {
  id: string;
  rowNumber: number;
}

export interface PlannedParticipant extends ParticipantIdCandidate {
  data: ParticipantDocument;
}

export interface ImportIssue {
  scope: "arguments" | "config" | "file" | "row" | "collision" | "write";
  message: string;
  rowNumber?: number;
  participantId?: string;
}

export interface ImportRowResult {
  rowNumber: number;
  status: "planned" | "invalid";
  participantId?: string;
  name?: string;
}

export interface ImportPlan {
  participants: PlannedParticipant[];
  participantsPlanned: number;
  rowResults: ImportRowResult[];
  issues: ImportIssue[];
}

interface TransformedRow {
  candidate?: ParticipantIdCandidate;
  participant?: PlannedParticipant;
  rowResult: ImportRowResult;
  issues: ImportIssue[];
}

export interface CollisionResult {
  participantId: string;
  status: "clear" | "existing";
}

export interface ImportReport {
  event: string;
  file: string;
  project: string;
  target: string;
  destinationPath: string;
  mode: "dry-run" | "apply";
  configPath?: string;
  schemaVersion?: number;
  configVersion?: string;
  algorithmVersion?: string;
  contentHash?: string;
  scoringFingerprint?: string;
  rowsRead: number;
  rowResults: ImportRowResult[];
  collisionResults: CollisionResult[];
  participantsPlanned: number;
  participantsWritten: number;
  issues: ImportIssue[];
  outcome: "blocked" | "dry-run-valid" | "applied" | "write-failed" | "indeterminate";
}

export type ReadBinaryFile = (filePath: string) => Promise<Buffer>;

function valueAfterFlag(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function isValidFirestoreDocumentId(documentId: string): boolean {
  return documentId !== "" &&
    documentId !== "." &&
    documentId !== ".." &&
    !documentId.includes("/") &&
    !/^__.*__$/.test(documentId) &&
    new TextEncoder().encode(documentId).length <= 1_500;
}

function validateEventId(eventId: string): void {
  if (!isValidFirestoreDocumentId(eventId)) {
    throw new Error(`Invalid Firestore event document ID: "${eventId}"`);
  }
}

function defaultProjectId(usingEmulator: boolean): string | undefined {
  return (
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.VITE_FIREBASE_PROJECT_ID ??
    (usingEmulator ? "demo-fip-hifz" : undefined)
  );
}

export function parseCliArgs(
  argv: readonly string[],
  options: { cwd?: string; usingEmulator?: boolean } = {}
): CliArgs {
  const cwd = options.cwd ?? process.cwd();
  const usingEmulator = options.usingEmulator ?? Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const seen = new Set<string>();
  let event: string | undefined;
  let file = DEFAULT_FILE;
  let project = defaultProjectId(usingEmulator);
  let apply = false;

  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (!flag.startsWith("--")) {
      throw new Error(`Unexpected positional argument: "${flag}"`);
    }
    if (seen.has(flag)) {
      throw new Error(`Duplicate argument: ${flag}`);
    }
    seen.add(flag);

    switch (flag) {
      case "--event":
        event = valueAfterFlag(argv, index, flag);
        index++;
        break;
      case "--file":
        file = valueAfterFlag(argv, index, flag);
        index++;
        break;
      case "--project":
        project = valueAfterFlag(argv, index, flag);
        index++;
        break;
      case "--apply":
        apply = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (!event) {
    throw new Error("Missing required argument: --event <eventId>");
  }
  validateEventId(event);
  if (!project) {
    throw new Error(
      "Missing project ID: pass --project or set GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT/VITE_FIREBASE_PROJECT_ID"
    );
  }

  return {
    event,
    file: path.resolve(cwd, file),
    project,
    apply,
  };
}

export function cleanText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cleanLockedName(value: string): string {
  return cleanText(value.replace(/_+/g, " "));
}

export function buildReadableName(
  firstName: string,
  lastName: string,
  lockedName: string
): string {
  const readableName = cleanText(`${cleanText(firstName)} ${cleanText(lastName)}`);
  return readableName || cleanLockedName(lockedName);
}

export { generateParticipantId };

function normalizedCountryKey(value: string): string {
  return cleanText(value)
    .replace(/\.(?:png|jpe?g|gif|webp|svg)$/i, "")
    .replace(/[_-]+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function resolveCountry(
  value: string
): { name: string; flag: string } | undefined {
  const key = normalizedCountryKey(value);
  if (!key) return undefined;
  return AVAILABLE_COUNTRIES.find(
    (country) => normalizedCountryKey(country.name) === key
  );
}

function parsePositiveInteger(value: string): number | undefined {
  if (!/^[0-9]+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function rowIsBlank(row: readonly unknown[]): boolean {
  return row.every((cell) => cleanText(cell) === "");
}

function mapHeaders(headerRow: readonly unknown[]): Map<string, number> {
  const headers = new Map<string, number>();
  for (const [index, value] of headerRow.entries()) {
    const header = cleanText(value);
    if (!header) continue;
    if (headers.has(header)) {
      throw new Error(`Duplicate spreadsheet header: "${header}"`);
    }
    headers.set(header, index);
  }
  return headers;
}

interface SpreadsheetRow {
  rowNumber: number;
  cells: unknown[];
}

function parseStrictCsv(text: string, delimiter: string): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = [];
  let cells: string[] = [];
  let field = "";
  let lineNumber = 1;
  let rowNumber = 1;
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    cells.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    rows.push({ rowNumber, cells });
    cells = [];
    rowNumber = lineNumber + 1;
  };

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
        if (character === "\n") lineNumber++;
      }
      continue;
    }

    if (afterQuote) {
      if (character === delimiter) {
        finishField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index++;
        finishRow();
        lineNumber++;
      } else {
        throw new Error(`Malformed CSV quoting on row ${rowNumber}: characters follow a closing quote`);
      }
      continue;
    }

    if (character === '"') {
      if (field !== "") {
        throw new Error(`Malformed CSV quoting on row ${rowNumber}: quote appears in an unquoted field`);
      }
      quoted = true;
    } else if (character === delimiter) {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      finishRow();
      lineNumber++;
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error(`Malformed CSV quoting on row ${rowNumber}: unterminated quoted field`);
  }
  if (field !== "" || cells.length > 0 || afterQuote) finishRow();
  return rows;
}

function firstNonBlankPhysicalLine(text: string): { rowNumber: number; text: string } | undefined {
  const lines = text.split(/\r\n|\n|\r/);
  const index = lines.findIndex((line) => line.trim() !== "");
  return index === -1 ? undefined : { rowNumber: index + 1, text: lines[index] };
}

function countUnquotedDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) {
      count++;
    }
  }
  return count;
}

function detectCsvFormat(text: string): { delimiter: string; separatorRow?: number } {
  const firstLine = firstNonBlankPhysicalLine(text);
  if (!firstLine) return { delimiter: "," };

  const separatorMatch = /^sep=(.)$/i.exec(firstLine.text.trim());
  if (separatorMatch) {
    return { delimiter: separatorMatch[1], separatorRow: firstLine.rowNumber };
  }

  const candidates = [",", ";", "\t"];
  const counts = candidates.map((delimiter) => ({
    delimiter,
    count: countUnquotedDelimiter(firstLine.text, delimiter),
  }));
  counts.sort((left, right) => right.count - left.count);
  return { delimiter: counts[0].count > 0 ? counts[0].delimiter : "," };
}

function readUtf8Csv(filePath: string): string {
  try {
    const contents = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(filePath));
    return contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("CSV is not valid UTF-8");
    throw error;
  }
}

function spreadsheetRows(filePath: string): SpreadsheetRow[] {
  if (path.extname(filePath).toLocaleLowerCase("en-US") === ".csv") {
    const text = readUtf8Csv(filePath);
    const format = detectCsvFormat(text);
    return parseStrictCsv(text, format.delimiter)
      .filter((row) => row.rowNumber !== format.separatorRow);
  }

  const workbook = XLSX.readFile(filePath, { raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Spreadsheet contains no worksheets");
  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  const firstPhysicalRow = sheet["!ref"]
    ? XLSX.utils.decode_range(sheet["!ref"]).s.r + 1
    : 1;
  return matrix.map((cells, index) => ({
    rowNumber: firstPhysicalRow + index,
    cells: cells ?? [],
  }));
}

export function parseSpreadsheet(filePath: string): ParsedSpreadsheet {
  const strictFieldCount = path.extname(filePath).toLocaleLowerCase("en-US") === ".csv";
  const matrix = spreadsheetRows(filePath);
  const headerIndex = matrix.findIndex((row) => !rowIsBlank(row.cells));
  if (headerIndex === -1) throw new Error("Spreadsheet is empty");
  const headerRow = matrix[headerIndex].cells;
  const headers = mapHeaders(headerRow);
  const missingHeaders = REQUIRED_COLUMNS.filter((header) => !headers.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing spreadsheet headers: ${missingHeaders.join(", ")}`);
  }

  const rows: ParsedCsvRow[] = [];
  const rowResults: ImportRowResult[] = [];
  const issues: ImportIssue[] = [];
  let rowsRead = 0;
  for (const row of matrix.slice(headerIndex + 1)) {
    if (rowIsBlank(row.cells)) {
      // Drop blank rows, except a strict-CSV record whose delimiter count gives
      // the wrong number of fields — that is structurally malformed and must be
      // reported, not silently skipped. A correct-width all-empty row (e.g. a
      // trailing ",,,,,,,") is still just a blank line.
      if (
        !strictFieldCount ||
        row.cells.length <= 1 ||
        row.cells.length === headerRow.length
      ) {
        continue;
      }
    }
    rowsRead++;
    if (strictFieldCount && row.cells.length !== headerRow.length) {
      rowResults.push({ rowNumber: row.rowNumber, status: "invalid" });
      issues.push(rowIssue(
        row.rowNumber,
        `Malformed CSV row: expected ${headerRow.length} fields but found ${row.cells.length}`
      ));
      continue;
    }
    const values = Object.fromEntries(
      REQUIRED_COLUMNS.map((header) => [
        header,
        cleanText(row.cells[headers.get(header) as number]),
      ])
    ) as Record<CsvColumn, string>;
    rows.push({ rowNumber: row.rowNumber, values });
  }
  return { rows, rowsRead, rowResults, issues };
}

/** Photo references are confined to the CSV's own directory tree. An absolute
 * path or a `..` escape is rejected so a malicious row can't make the importer
 * read (and upload) arbitrary local files such as service-account keys. */
function photoPathFromReference(csvPath: string, photoReference: string): string {
  if (path.isAbsolute(photoReference)) {
    throw new Error(`photo path must be relative to the CSV, got absolute ${JSON.stringify(photoReference)}`);
  }
  const baseDir = path.resolve(path.dirname(csvPath));
  const resolved = path.resolve(baseDir, photoReference);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    throw new Error(`photo path escapes the CSV directory: ${JSON.stringify(photoReference)}`);
  }
  return resolved;
}

async function readPhotoFileBounded(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const metadata = await handle.stat();
    if (metadata.size > MAX_PHOTO_RAW_BYTES) {
      throw new Error(`photo file exceeds the ${MAX_PHOTO_RAW_BYTES}-byte raw file limit`);
    }
    const buffer = Buffer.allocUnsafe(MAX_PHOTO_RAW_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const result = await handle.read(
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead
      );
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > MAX_PHOTO_RAW_BYTES) {
      throw new Error(`photo file exceeds the ${MAX_PHOTO_RAW_BYTES}-byte raw file limit`);
    }
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Resource-exhaustion / IO-subsystem failures are process-wide, not a
 * property of this row — they must abort the import with their real cause
 * instead of being recorded as an ordinary "bad photo" row issue. */
const SYSTEMIC_FILE_ERROR_CODES = new Set(["EMFILE", "ENFILE", "EIO", "ENOMEM"]);

function isSystemicFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    SYSTEMIC_FILE_ERROR_CODES.has((error as { code: string }).code)
  );
}

export async function loadPhotoBase64(
  csvPath: string,
  photoReference: string,
  readBinaryFile: ReadBinaryFile = readPhotoFileBounded
): Promise<string | undefined> {
  if (!photoReference) return undefined;
  const bytes = await readBinaryFile(photoPathFromReference(csvPath, photoReference));
  if (bytes.length === 0) throw new Error("photo file is empty");
  if (bytes.length > MAX_PHOTO_RAW_BYTES) {
    throw new Error(`photo file exceeds the ${MAX_PHOTO_RAW_BYTES}-byte raw file limit`);
  }
  return bytes.toString("base64");
}

function rowIssue(rowNumber: number, message: string): ImportIssue {
  return { scope: "row", rowNumber, message };
}

function rowResult(
  rowNumber: number,
  status: ImportRowResult["status"],
  name: string,
  candidate?: ParticipantIdCandidate
): ImportRowResult {
  return {
    rowNumber,
    status,
    ...(candidate ? { participantId: candidate.id } : {}),
    ...(name ? { name } : {}),
  };
}

function encodedPhotoSizeIssue(photo: string | undefined): string | undefined {
  if (photo && Buffer.byteLength(photo, "utf8") > MAX_FIRESTORE_STRING_BYTES) {
    return `encoded photo exceeds Firestore's ${MAX_FIRESTORE_STRING_BYTES}-byte string field limit`;
  }
  return undefined;
}

function firestoreStringSize(value: string): number {
  return Buffer.byteLength(value, "utf8") + 1;
}

function firestoreDocumentNameSize(eventId: string, participantId: string): number {
  return ["events", eventId, "participants", participantId]
    .reduce((total, segment) => total + firestoreStringSize(segment), 0) +
    FIRESTORE_DOCUMENT_NAME_OVERHEAD_BYTES;
}

function firestoreValueSize(value: ParticipantDocument[keyof ParticipantDocument]): number {
  if (value === undefined) return 0;
  if (typeof value === "string") return firestoreStringSize(value);
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 1;
  return value.reduce((total, item) => total + firestoreValueSize(item), 0);
}

export function estimateParticipantDocumentBytes(
  eventId: string,
  participantId: string,
  data: ParticipantDocument
): number {
  const fieldBytes = Object.entries(data).reduce(
    (total, [fieldName, value]) =>
      total + firestoreStringSize(fieldName) +
      firestoreValueSize(value as ParticipantDocument[keyof ParticipantDocument]),
    0
  );
  const timestampBytes = ["createdAt", "updatedAt"].reduce(
    (total, fieldName) => total + firestoreStringSize(fieldName) + FIRESTORE_TIMESTAMP_BYTES,
    0
  );
  return firestoreDocumentNameSize(eventId, participantId) + fieldBytes + timestampBytes +
    FIRESTORE_DOCUMENT_OVERHEAD_BYTES;
}

function participantDocumentSizeIssue(
  eventId: string,
  participantId: string,
  data: ParticipantDocument
): string | undefined {
  const estimatedBytes = estimateParticipantDocumentBytes(eventId, participantId, data);
  if (estimatedBytes > MAX_FIRESTORE_DOCUMENT_BYTES) {
    return `participant document is estimated at ${estimatedBytes} bytes and exceeds Firestore's ${MAX_FIRESTORE_DOCUMENT_BYTES}-byte document limit`;
  }
  return undefined;
}

function estimateParticipantWriteBytes(
  eventId: string,
  participant: PlannedParticipant
): number {
  return estimateParticipantDocumentBytes(eventId, participant.id, participant.data) +
    WRITE_OVERHEAD_BYTES;
}

export function estimateAtomicCommitBytes(
  eventId: string,
  participants: readonly PlannedParticipant[]
): number {
  return participants.reduce(
    (total, participant) => total + estimateParticipantWriteBytes(eventId, participant),
    COMMIT_BASE_OVERHEAD_BYTES
  );
}

function atomicCommitSizeIssue(
  eventId: string,
  participants: readonly PlannedParticipant[]
): ImportIssue | undefined {
  const estimatedBytes = estimateAtomicCommitBytes(eventId, participants);
  if (estimatedBytes <= MAX_ATOMIC_COMMIT_ESTIMATED_BYTES) return undefined;
  return {
    scope: "file",
    message: `estimated atomic commit size ${estimatedBytes} bytes exceeds the conservative ${MAX_ATOMIC_COMMIT_ESTIMATED_BYTES}-byte limit`,
  };
}

export async function transformRow(
  row: ParsedCsvRow,
  config: EventEvaluationConfigV2,
  csvPath: string,
  readBinaryFile: ReadBinaryFile = readPhotoFileBounded,
  eventId = ""
): Promise<TransformedRow> {
  const values = row.values;
  const issues: ImportIssue[] = [];
  const name = buildReadableName(
    values[CSV_COLUMNS.firstName],
    values[CSV_COLUMNS.lastName],
    values[CSV_COLUMNS.lockedName]
  );
  if (!name) issues.push(rowIssue(row.rowNumber, "participant name is required"));

  const id = generateParticipantId(name);
  const candidate = participantIdValidationError(id) === null
    ? { id, rowNumber: row.rowNumber }
    : undefined;
  if (!candidate) {
    issues.push(
      rowIssue(row.rowNumber, "participant name does not produce a valid Firestore document ID")
    );
  }

  const age = parsePositiveInteger(values[CSV_COLUMNS.age]);
  if (age === undefined) {
    issues.push(rowIssue(row.rowNumber, "AGE ON EVENT must be a positive integer"));
  }

  const country = resolveCountry(values[CSV_COLUMNS.country]);
  if (!country) {
    issues.push(rowIssue(row.rowNumber, "country must exactly match a recognized shared country"));
  }

  const category = values[CSV_COLUMNS.category];
  if (!Object.hasOwn(config.categories, category)) {
    issues.push(
      rowIssue(
        row.rowNumber,
        `CATEGORY must exactly match an event category ID (${Object.keys(config.categories).sort().join(", ")})`
      )
    );
  }

  let photo: string | undefined;
  const photoReference = values[CSV_COLUMNS.photo];
  if (photoReference) {
    try {
      photo = await loadPhotoBase64(csvPath, photoReference, readBinaryFile);
      const sizeIssue = encodedPhotoSizeIssue(photo);
      if (sizeIssue) issues.push(rowIssue(row.rowNumber, sizeIssue));
    } catch (error) {
      if (isSystemicFileError(error)) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      issues.push(rowIssue(row.rowNumber, `unable to read photo "${photoReference}": ${reason}`));
    }
  }

  if (issues.length > 0 || age === undefined || !country || !candidate) {
    return {
      candidate,
      rowResult: rowResult(row.rowNumber, "invalid", name, candidate),
      issues,
    };
  }

  const data: ParticipantDocument = {
    name,
    age,
    country: country.name,
    category,
    school: "",
    scheduled: values[CSV_COLUMNS.scheduled],
    isDone: false,
    isActive: false,
    flag: country.flag,
    parentsName: "",
    phoneNum: "",
    email: "",
    assignedQuestions: [],
    activeQuestion: 0,
    ...(photo ? { photo } : {}),
  };
  const sizeIssue = participantDocumentSizeIssue(eventId, candidate.id, data);
  if (sizeIssue) {
    return {
      candidate,
      rowResult: rowResult(row.rowNumber, "invalid", name, candidate),
      issues: [rowIssue(row.rowNumber, sizeIssue)],
    };
  }
  return {
    candidate,
    participant: { ...candidate, data },
    rowResult: rowResult(row.rowNumber, "planned", name, candidate),
    issues: [],
  };
}

export function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) as number);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) as number);
  const commonLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < commonLength; index++) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
}

export function duplicateIdIssues(
  candidates: readonly ParticipantIdCandidate[]
): ImportIssue[] {
  const rowsById = new Map<string, number[]>();
  for (const candidate of candidates) {
    const rows = rowsById.get(candidate.id) ?? [];
    rows.push(candidate.rowNumber);
    rowsById.set(candidate.id, rows);
  }

  return [...rowsById.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([participantId, rows]) => ({
      scope: "collision" as const,
      participantId,
      message: `duplicate planned participant ID on rows ${rows.sort((a, b) => a - b).join(", ")}`,
    }));
}

export async function buildImportPlan(
  rows: readonly ParsedCsvRow[],
  config: EventEvaluationConfigV2,
  csvPath: string,
  readBinaryFile: ReadBinaryFile = readPhotoFileBounded,
  eventId = ""
): Promise<ImportPlan> {
  if (rows.length === 0) {
    return {
      participants: [],
      participantsPlanned: 0,
      rowResults: [],
      issues: [{ scope: "file", message: "spreadsheet contains no participant rows" }],
    };
  }

  const candidates: ParticipantIdCandidate[] = [];
  const participants: PlannedParticipant[] = [];
  const rowResults: ImportRowResult[] = [];
  const issues: ImportIssue[] = [];
  let participantsPlanned = 0;
  let estimatedCommitBytes = COMMIT_BASE_OVERHEAD_BYTES;
  let retainParticipants = rows.length <= MAX_ATOMIC_WRITES;

  if (!retainParticipants) {
    issues.push({
      scope: "file",
      message: `spreadsheet has ${rows.length} rows; atomic imports are limited to ${MAX_ATOMIC_WRITES}`,
    });
  }

  for (const row of rows) {
    const transformed = await transformRow(row, config, csvPath, readBinaryFile, eventId);
    if (transformed.candidate) candidates.push(transformed.candidate);
    rowResults.push(transformed.rowResult);
    issues.push(...transformed.issues);
    if (!transformed.participant) continue;

    participantsPlanned++;
    if (rows.length > MAX_ATOMIC_WRITES) continue;

    estimatedCommitBytes += estimateParticipantWriteBytes(eventId, transformed.participant);
    if (estimatedCommitBytes > MAX_ATOMIC_COMMIT_ESTIMATED_BYTES) {
      retainParticipants = false;
      participants.length = 0;
    }
    if (retainParticipants) participants.push(transformed.participant);
  }

  issues.push(...duplicateIdIssues(candidates));
  if (estimatedCommitBytes > MAX_ATOMIC_COMMIT_ESTIMATED_BYTES) {
    issues.push({
      scope: "file",
      message: `estimated atomic commit size ${estimatedCommitBytes} bytes exceeds the conservative ${MAX_ATOMIC_COMMIT_ESTIMATED_BYTES}-byte limit`,
    });
  }
  return {
    participants,
    participantsPlanned,
    rowResults: sortRowResults(rowResults),
    issues: sortIssues(issues),
  };
}

function chunksOf<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function checkExistingParticipants(
  db: Firestore,
  eventId: string,
  participants: readonly PlannedParticipant[]
): Promise<CollisionResult[]> {
  const participantIds = [...new Set(participants.map((participant) => participant.id))]
    .sort(compareCodePoints);
  const results: CollisionResult[] = [];

  for (const participantIdChunk of chunksOf(participantIds, MAX_ATOMIC_WRITES)) {
    const refs = participantIdChunk.map((participantId) =>
      db.doc(`events/${eventId}/participants/${participantId}`)
    );
    const snapshots = await db.getAll(...refs, { fieldMask: [] });
    results.push(
      ...snapshots.map((snapshot) => ({
        participantId: snapshot.id,
        status: snapshot.exists ? "existing" as const : "clear" as const,
      }))
    );
  }
  return results;
}

function existingCollisionIssues(
  collisionResults: readonly CollisionResult[]
): ImportIssue[] {
  return collisionResults
    .filter((result) => result.status === "existing")
    .map((result) => ({
      scope: "collision" as const,
      participantId: result.participantId,
      message: "participant document already exists",
    }));
}

export async function applyImportPlan(
  db: Firestore,
  eventId: string,
  participants: readonly PlannedParticipant[]
): Promise<void> {
  if (participants.length > MAX_ATOMIC_WRITES) {
    throw new Error(`atomic imports are limited to ${MAX_ATOMIC_WRITES} participants`);
  }
  const sizeIssue = atomicCommitSizeIssue(eventId, participants);
  if (sizeIssue) throw new Error(sizeIssue.message);
  const batch = db.batch();
  for (const participant of participants) {
    batch.create(db.doc(`events/${eventId}/participants/${participant.id}`), {
      ...participant.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

function compareOptionalText(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return compareCodePoints(left, right);
}

function sortRowResults(results: readonly ImportRowResult[]): ImportRowResult[] {
  return [...results].sort((left, right) => left.rowNumber - right.rowNumber);
}

function sortCollisionResults(results: readonly CollisionResult[]): CollisionResult[] {
  return [...results].sort((left, right) =>
    compareCodePoints(left.participantId, right.participantId)
  );
}

function sortIssues(issues: readonly ImportIssue[]): ImportIssue[] {
  return [...issues].sort((left, right) => {
    const rowDifference = (left.rowNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.rowNumber ?? Number.MAX_SAFE_INTEGER);
    if (rowDifference !== 0) return rowDifference;
    const idDifference = compareOptionalText(left.participantId, right.participantId);
    if (idDifference !== 0) return idDifference;
    const scopeDifference = compareCodePoints(left.scope, right.scope);
    if (scopeDifference !== 0) return scopeDifference;
    return compareCodePoints(left.message, right.message);
  });
}

function finalizeReport(report: ImportReport): ImportReport {
  report.rowResults = sortRowResults(report.rowResults);
  report.collisionResults = sortCollisionResults(report.collisionResults);
  report.issues = sortIssues(report.issues);
  return report;
}

export function formatImportReport(report: ImportReport): string {
  const lines = [
    "PARTICIPANT IMPORT REPORT",
    `event: ${report.event}`,
    `project: ${report.project}`,
    `target: ${report.target}`,
    `destinationPath: ${report.destinationPath}`,
    `file: ${report.file}`,
    `mode: ${report.mode}`,
    `configPath: ${report.configPath ?? "not verified"}`,
    `schemaVersion: ${report.schemaVersion ?? "not verified"}`,
    `configVersion: ${report.configVersion ?? "not verified"}`,
    `algorithmVersion: ${report.algorithmVersion ?? "not verified"}`,
    `contentHash: ${report.contentHash ?? "not verified"}`,
    `scoringFingerprint: ${report.scoringFingerprint ?? "not verified"}`,
    `rowsRead: ${report.rowsRead}`,
    `participantsPlanned: ${report.participantsPlanned}`,
    `participantsWritten: ${report.participantsWritten}`,
    `collisionChecks: ${report.collisionResults.length}`,
    `blockingIssues: ${report.issues.length}`,
  ];

  for (const row of sortRowResults(report.rowResults)) {
    const identity = row.participantId && row.name
      ? ` id ${row.participantId}, name ${JSON.stringify(row.name)}`
      : "";
    lines.push(`- [row] row ${row.rowNumber}: ${row.status}${identity}`);
  }
  for (const collision of sortCollisionResults(report.collisionResults)) {
    lines.push(`- [collision-check] id ${collision.participantId}: ${collision.status}`);
  }
  for (const issue of sortIssues(report.issues)) {
    const location = [
      issue.rowNumber === undefined ? undefined : `row ${issue.rowNumber}`,
      issue.participantId === undefined ? undefined : `id ${issue.participantId}`,
    ].filter(Boolean).join(", ");
    lines.push(`- [${issue.scope}]${location ? ` ${location}:` : ""} ${issue.message}`);
  }
  lines.push(`outcome: ${report.outcome}`);
  return lines.join("\n");
}

function firestoreTarget(): string {
  return process.env.FIRESTORE_EMULATOR_HOST
    ? `emulator:${process.env.FIRESTORE_EMULATOR_HOST}`
    : "production";
}

export function firestoreAppName(projectId: string): string {
  const identity = Buffer.from(`${projectId}\0${firestoreTarget()}`).toString("base64url");
  return `participant-import:${identity}`;
}

function verifyExistingApp(app: App, projectId: string): void {
  if (app.options.projectId !== projectId) {
    throw new Error(
      `Admin app ${JSON.stringify(app.name)} targets project ${JSON.stringify(app.options.projectId)}, not ${JSON.stringify(projectId)}`
    );
  }
}

export function initializeFirestore(projectId: string): Firestore {
  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const appName = firestoreAppName(projectId);
  const existingApp = getApps().find((app) => app.name === appName);
  if (existingApp) verifyExistingApp(existingApp, projectId);
  const app = existingApp ?? initializeApp(
    usingEmulator
      ? { projectId }
      : { credential: applicationDefault(), projectId },
    appName
  );
  return getFirestore(app);
}

export function initializeEmulatorFirestore(
  projectId: string,
  allowedProjectIds: readonly string[] = ["demo-fip-hifz"]
): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST must be set for emulator-only Firestore access");
  }
  if (!allowedProjectIds.includes(projectId)) {
    throw new Error(`Project ${JSON.stringify(projectId)} is not allowed for emulator tests`);
  }
  return initializeFirestore(projectId);
}

async function loadVerifiedConfig(
  db: Firestore,
  eventId: string
): Promise<Awaited<ReturnType<typeof loadEvaluationConfig>>> {
  return loadEvaluationConfig(eventId, {
    getEventDocument: async () => {
      const snapshot = await db.doc(`events/${eventId}`).get();
      return snapshot.exists ? snapshot.data() : undefined;
    },
    getConfigDocument: async (configPath) => {
      // An absent document is `undefined` (config missing); a thrown read
      // error (permission denied, network) propagates so it's reported as a
      // real operational failure rather than a missing config.
      const snapshot = await db.doc(configPath).get();
      return snapshot.exists ? snapshot.data() : undefined;
    },
  });
}

function emptyReport(args: CliArgs): ImportReport {
  return {
    event: args.event,
    project: args.project,
    target: firestoreTarget(),
    destinationPath: `events/${args.event}/participants`,
    file: args.file,
    mode: args.apply ? "apply" : "dry-run",
    rowsRead: 0,
    rowResults: [],
    collisionResults: [],
    participantsPlanned: 0,
    participantsWritten: 0,
    issues: [],
    outcome: "blocked",
  };
}

function argumentValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

export function argumentFailureReport(
  argv: readonly string[],
  error: unknown,
  options: { cwd?: string; usingEmulator?: boolean } = {}
): ImportReport {
  const cwd = options.cwd ?? process.cwd();
  const usingEmulator = options.usingEmulator ?? Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const report = emptyReport({
    event: argumentValue(argv, "--event") ?? "not provided",
    file: path.resolve(cwd, argumentValue(argv, "--file") ?? DEFAULT_FILE),
    project: argumentValue(argv, "--project") ?? defaultProjectId(usingEmulator) ?? "not provided",
    apply: argv.includes("--apply"),
  });
  report.issues.push({
    scope: "arguments",
    message: error instanceof Error ? error.message : String(error),
  });
  return finalizeReport(report);
}

export async function runImport(args: CliArgs, db: Firestore): Promise<ImportReport> {
  const report = emptyReport(args);
  let loaded: Awaited<ReturnType<typeof loadEvaluationConfig>>;
  try {
    loaded = await loadVerifiedConfig(db, args.event);
  } catch (error) {
    report.issues.push({
      scope: "config",
      message: error instanceof Error ? error.message : String(error),
    });
    return finalizeReport(report);
  }
  if (loaded.status !== "ready") {
    report.issues.push({ scope: "config", message: loaded.reason });
    return finalizeReport(report);
  }
  report.configPath = loaded.descriptor.configPath;
  report.schemaVersion = loaded.config.schemaVersion;
  report.configVersion = loaded.config.configVersion;
  report.algorithmVersion = loaded.config.algorithmVersion;
  report.contentHash = loaded.config.contentHash;
  report.scoringFingerprint = loaded.config.scoringFingerprint;

  let parsed: ParsedSpreadsheet;
  try {
    parsed = parseSpreadsheet(args.file);
  } catch (error) {
    report.issues.push({
      scope: "file",
      message: error instanceof Error ? error.message : String(error),
    });
    return finalizeReport(report);
  }
  report.rowsRead = parsed.rowsRead;

  const plan = await buildImportPlan(
    parsed.rows,
    loaded.config,
    args.file,
    readPhotoFileBounded,
    args.event
  );
  report.rowResults = [...parsed.rowResults, ...plan.rowResults];
  report.participantsPlanned = plan.participantsPlanned;
  report.issues.push(...parsed.issues, ...plan.issues);
  if (report.issues.length > 0) return finalizeReport(report);

  try {
    report.collisionResults = await checkExistingParticipants(
      db,
      args.event,
      plan.participants
    );
    report.issues.push(...existingCollisionIssues(report.collisionResults));
  } catch (error) {
    report.issues.push({
      scope: "collision",
      message: `unable to check existing participant IDs: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
  if (report.issues.length > 0) return finalizeReport(report);

  if (!args.apply) {
    report.outcome = "dry-run-valid";
    return finalizeReport(report);
  }

  try {
    await applyImportPlan(db, args.event, plan.participants);
    report.participantsWritten = plan.participants.length;
    report.outcome = "applied";
  } catch (error) {
    // A thrown commit is ambiguous: the atomic batch may or may not have been
    // applied server-side (e.g. a timeout after the write landed). Don't claim
    // zero writes — flag it as indeterminate so the operator reconciles before
    // re-running (a blind retry would trip the collision checks).
    report.issues.push({
      scope: "write",
      message: `commit outcome is unknown; the ${plan.participants.length} planned participant(s) may or may not have been written — verify the event before re-running: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    report.outcome = "indeterminate";
  }
  return finalizeReport(report);
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(formatImportReport(argumentFailureReport(process.argv.slice(2), error)));
    process.exitCode = 1;
    return;
  }

  try {
    const report = await runImport(args, initializeFirestore(args.project));
    console.log(formatImportReport(report));
    if (report.outcome !== "applied" && report.outcome !== "dry-run-valid") {
      process.exitCode = 1;
    }
  } catch (error) {
    const report = emptyReport(args);
    report.issues.push({
      scope: "write",
      message: error instanceof Error ? error.message : String(error),
    });
    report.outcome = "write-failed";
    console.error(formatImportReport(report));
    process.exitCode = 1;
  }
}

const isMainModule = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  await main();
}
