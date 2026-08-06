import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { buildAhlulQuranMozambiqueConfig } from "../src/evaluation/ahlulQuranMozambiqueSeed";
import { getFlagForCountry } from "../src/lib/countryUtils";
import {
  generateParticipantId,
  participantIdValidationError,
} from "../src/lib/participantId";
import {
  EXAMPLE_ROSTER_MODULE_URL,
  ROSTER_MODULE_URL,
  loadRoster,
  rosterFileExists,
  type DeferredEntry,
  type RosterEntry,
} from "./data/rosterTypes";

const AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

/**
 * The real roster is gitignored (it lists children by name and age, and this
 * repository is public), so these checks run against the committed example in
 * a fresh clone and against the real sheet on a machine that has it. The rules
 * being enforced are the same either way — only the data differs.
 */
function rosterContract(
  label: string,
  load: () => Promise<{ ROSTER: readonly RosterEntry[]; DEFERRED: readonly DeferredEntry[] }>
) {
  describe(`roster contract (${label})`, () => {
    it("assigns every roster entry a category the config defines", async () => {
      const { ROSTER } = await load();
      const config = await buildAhlulQuranMozambiqueConfig(AT);
      expect(ROSTER.length).toBeGreaterThan(0);
      for (const entry of ROSTER) {
        expect(Object.keys(config.categories), entry.name).toContain(entry.category);
      }
    });

    it("keeps deferred participants out of the roster entirely", async () => {
      const { ROSTER, DEFERRED } = await load();
      const rosterNames = new Set(ROSTER.map((entry) => entry.name));
      for (const entry of DEFERRED) {
        expect(rosterNames.has(entry.name), entry.name).toBe(false);
        // A row is deferred precisely because its leaf category is undecided,
        // so it must offer more than one candidate.
        expect(entry.candidates.length, entry.name).toBeGreaterThan(1);
      }
    });

    it("numbers every row exactly once across roster and deferred", async () => {
      const { ROSTER, DEFERRED } = await load();
      const rows = [...ROSTER.map((e) => e.row), ...DEFERRED.map((e) => e.row)];
      expect(new Set(rows).size).toBe(rows.length);
    });

    it("produces a distinct, valid Firestore document id per participant", async () => {
      const { ROSTER } = await load();
      const ids = new Map<string, string>();
      for (const entry of ROSTER) {
        const id = generateParticipantId(entry.name);
        expect(participantIdValidationError(id), entry.name).toBeNull();
        expect(ids.has(id), `${entry.name} collides with ${ids.get(id)}`).toBe(false);
        ids.set(id, entry.name);
      }
      expect(ids.size).toBe(ROSTER.length);
    });

    it("uses country names the app can resolve to a flag", async () => {
      const { ROSTER, DEFERRED } = await load();
      for (const entry of [...ROSTER, ...DEFERRED]) {
        expect(getFlagForCountry(entry.country), entry.country).toBeTruthy();
      }
    });

    it("records a usable age and name for everyone it imports", async () => {
      const { ROSTER } = await load();
      for (const entry of ROSTER) {
        expect(entry.name.trim(), `row ${entry.row}`).not.toBe("");
        expect(Number.isInteger(entry.age), entry.name).toBe(true);
        expect(entry.age, entry.name).toBeGreaterThan(0);
      }
    });
  });
}

rosterContract("committed example", () => loadRoster(EXAMPLE_ROSTER_MODULE_URL));

const hasRealRoster = rosterFileExists();

describe.skipIf(!hasRealRoster)("real Mozambique sheet", () => {
  it("accounts for every row of the source sheet exactly once", async () => {
    const { ROSTER, DEFERRED } = await loadRoster();
    const rows = [...ROSTER.map((e) => e.row), ...DEFERRED.map((e) => e.row)].sort(
      (a, b) => a - b
    );
    // SEMIFINALISTAS.docx numbers its semi-finalists 1..36 (rows 37-40 of the
    // table are blank placeholders).
    expect(rows).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(ROSTER).toHaveLength(30);
    expect(DEFERRED).toHaveLength(6);
  });

  it("matches the sheet's per-category headcount", async () => {
    const { ROSTER } = await loadRoster();
    const counts = ROSTER.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.category] = (acc[entry.category] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ A2: 5, B1: 2, B2: 4, C1: 1, C2: 4, D: 14 });
    // A1 (Juz Amma) exists in the config but has no semi-finalists on this
    // sheet. That is not an error — it is the sheet.
    expect(counts.A1).toBeUndefined();
  });
});

if (hasRealRoster) rosterContract("real Mozambique sheet", () => loadRoster());

describe("roster loading", () => {
  it("explains itself when the gitignored roster is absent", async () => {
    const missing = new URL("./does-not-exist.ts", ROSTER_MODULE_URL);
    await expect(loadRoster(missing)).rejects.toThrow(/gitignored on purpose/);
  });
});
