import type { DeferredEntry, RosterEntry } from "./rosterTypes";

/**
 * TEMPLATE — invented people, safe to commit.
 *
 * Copy this file to `ahlul-quran-mozambique-participants.ts` (gitignored) and
 * replace the rows with the real sheet. The provisioner reads that file, never
 * this one; this exists to document the shape and to give the roster checks in
 * `scripts/ahlul-quran-mozambique-roster.test.mts` something to run against in
 * a fresh clone.
 *
 * Transcription rules, which the real file must follow:
 *
 *  - A row goes in `ROSTER` only when the sheet states its LEAF category
 *    (A1/A2/B1/B2/C1/C2/D). Nothing is inferred.
 *  - A row whose `Categoria` cell repeats a group heading ("5 Juzs",
 *    "15 Juzs") has no recorded leaf category. It goes in `DEFERRED` with the
 *    categories it could resolve to, and is NOT provisioned — a participant
 *    scored against the wrong half of the Qur'an is an invisible failure until
 *    they are on stage.
 *  - `country` must be an English name that `AVAILABLE_COUNTRIES` knows, so
 *    the app can resolve a flag ("Moçambique" -> "Mozambique").
 *  - `school` is empty for a blank cell or a "------" placeholder.
 *  - `province` is provenance only. It is never written to Firestore:
 *    `Participant` has no province field and `participantShapeOk()` in
 *    firestore.rules pins the document to an exact key set.
 */

export const ROSTER: readonly RosterEntry[] = [
  { row: 1, name: "Example Participant One", age: 10, province: "Sofala", country: "Mozambique", school: "Example Madrassa", category: "A2" },
  { row: 2, name: "Example Participant Two", age: 14, province: "Maputo", country: "Mozambique", school: "Example Institute", category: "B1" },
  { row: 4, name: "Example Participant Three", age: 19, province: "Nampula", country: "Mozambique", school: "", category: "D" },
];

export const DEFERRED: readonly DeferredEntry[] = [
  { row: 3, name: "Example Undecided One", age: 12, province: "Sofala", country: "Mozambique", school: "Example Madrassa", sheetGroup: "5 Juzs", candidates: ["B1", "B2"] },
];
