# Phase 1 participant import: event-scoped V2

## Purpose and scope

Replace the interactive Python importer with a non-interactive TypeScript CLI that creates canonical participant documents under one explicitly selected event. The importer is a bounded offline administration tool; it does not create events, infer legacy categories, assign questions, activate participants, or change Firebase rules.

The importer must fail closed. It loads and verifies the selected event's evaluation descriptor and config before interpreting participant rows, validates the complete input and every destination ID before writing, and performs no writes unless the operator passes `--apply` and the full plan is valid.

## CLI contract

```text
npm run insert-participants -- --event <eventId> [--file <csvPath>] [--project <projectId>] [--apply]
```

- `--event` is required and must be a valid Firestore document ID.
- `--file` defaults to `scripts/participants.csv`.
- `--project` defaults to `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `VITE_FIREBASE_PROJECT_ID`, then `demo-fip-hifz` when the emulator is selected. A real-project run requires an explicit or environment-provided project ID and Application Default Credentials.
- The default mode is dry-run. Only `--apply` permits writes.
- Unknown flags, duplicate flags, missing flag values, positional arguments, and conflicting modes are errors.
- `FIRESTORE_EMULATOR_HOST` selects the emulator. Without it, `firebase-admin` uses Application Default Credentials.
- The command prints one deterministic report containing target, mode, verified config identity, row results, collision results, totals, and final outcome. Blocking errors produce a non-zero exit code.

## Config verification

The CLI supplies Admin SDK readers to `loadEvaluationConfig` from `src/evaluation/eventDescriptor.ts`. Before the CSV is validated, that loader must successfully verify:

- the event descriptor and referenced config document;
- schema and config versions;
- descriptor mode against config algorithm version;
- content hash, including recomputation;
- scoring fingerprint.

A missing event, missing config, malformed config, or mismatch aborts before participant collision reads or writes. The importer does not duplicate or weaken descriptor verification.

## Input and normalization

The existing spreadsheet headers remain the input boundary:

- `FIRST NAME`
- `LAST NAME`
- `🔒_FIRST_AND_LAST_NAME`
- `AGE ON EVENT`
- `🔒_FLAG_IMAGE`
- `CATEGORY`
- `SLOT SCHEDULE`
- `🔒_PARTICIPANT_PHOTO`

The file is parsed with the existing `xlsx` package. Blank rows are ignored; every non-blank row retains its spreadsheet row number for reporting.

For each row:

1. Trim and collapse whitespace in text fields.
2. Build the readable name from `FIRST NAME` plus `LAST NAME` when either is present. Use the locked full-name field only when both readable fields are absent; clean underscores and repeated whitespace in that fallback.
3. Generate the deterministic document ID from the readable name by Unicode-normalizing it, lowercasing it, replacing runs of non-letter/non-number characters with `_`, and trimming `_`. An empty ID is invalid. IDs are never silently suffixed.
4. Require `AGE ON EVENT` to be a positive base-10 integer.
5. Recognize the country by exact, case-insensitive comparison against `AVAILABLE_COUNTRIES` in `src/lib/countryUtils.ts`, after removing an optional image extension and treating `_`/`-` as spaces. Store the canonical country name and its shared emoji flag. No fuzzy match or default flag is allowed.
6. Require `CATEGORY` to exactly equal a category ID in the verified event config. No case folding or legacy mapping is allowed.
7. Preserve the cleaned schedule as an optional display string.
8. If `🔒_PARTICIPANT_PHOTO` is empty, omit `photo`. If present, resolve an absolute path as written or a relative path from the CSV's directory, read the file, and store only its raw base64 bytes. An unreadable or empty file is a row error; paths and `data:` prefixes are never stored.

Each planned participant has this initial state:

```text
name, age, country, category, school: "", scheduled,
isDone: false, isActive: false, flag,
parentsName: "", phoneNum: "", email: "",
assignedQuestions: [], activeQuestion: 0
```

`photo` is present only when successfully encoded. Applied documents also receive server-generated `createdAt` and `updatedAt` timestamps.

## Validation and zero-write guarantee

The importer builds the complete in-memory plan before creating a write batch:

1. Parse all rows and collect every row error rather than stopping at the first.
2. Reject an empty input and imports above Firestore's 500-operation atomic batch limit.
3. Reject duplicate generated IDs within the file and report every involved row.
4. Read every planned destination document and reject every existing-document collision.
5. Create no batch until all preceding checks have completed successfully.

Any config error, file error, row error, duplicate planned ID, or existing collision blocks the entire import. Dry-run never constructs or commits a batch. Apply uses one atomic Admin SDK batch and `batch.create`, not `set`, so a document created after collision validation causes the whole commit to fail instead of being overwritten. There is no partial success, skip, overwrite, or suffix behavior.

## Pure module boundaries

Keep the script understandable through small named functions:

- parse and validate CLI arguments;
- parse spreadsheet rows;
- clean text and readable names;
- generate participant IDs;
- resolve canonical countries and flags;
- load optional photos;
- validate and transform one row;
- detect duplicate planned IDs;
- plan existing-document collision reads;
- build the write plan;
- format the deterministic report;
- initialize Admin SDK readers and apply an atomic plan.

The executable entry point is guarded so tests can import pure functions without connecting to Firestore or exiting the process.

## Test cases

Pure tests cover:

- dry-run argument defaults and explicit `--apply`;
- required/unknown/duplicate CLI flags;
- CSV parsing and blank-row handling;
- readable first/last names and cleaned locked-name fallback;
- positive-integer ages;
- exact config category IDs and rejection of legacy/case-altered values;
- canonical shared country names and emoji flags, including filename-form inputs;
- absent, readable, unreadable, and raw-base64 photo behavior;
- deterministic Unicode-aware IDs;
- duplicate planned IDs and existing collision reports;
- canonical inactive, unfinished, unassigned defaults;
- deterministic report ordering.

An emulator-backed test provisions or reuses a verified V2 event and proves:

- a valid three-row dry-run leaves the collection unchanged;
- the same input with `--apply` creates three canonical participant documents with server timestamps, raw photo base64 where supplied, and inactive/unassigned defaults;
- a mixed valid/invalid multi-row input exits non-zero and leaves the participants collection unchanged;
- an existing-ID collision exits non-zero and creates none of the other planned participants.

The checked-in `scripts/participants.csv` is never modified. Its zero ages, missing countries, and legacy category IDs must appear as validation failures in a dry-run against `demo-2026`.
