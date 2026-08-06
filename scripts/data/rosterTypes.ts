import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Shape of a competition roster, and the loader that reads one.
 *
 * WHY THE DATA IS NOT IN THIS REPOSITORY. A roster is a list of children —
 * names, ages, home provinces and schools. This repository is public, so the
 * roster file is gitignored and loaded from disk at run time instead of being
 * imported statically. `ahlul-quran-mozambique-participants.example.ts` shows
 * the shape with invented people; copy it to
 * `ahlul-quran-mozambique-participants.ts` and fill in the real sheet.
 *
 * The import in `loadRoster` is deliberately built from a computed URL rather
 * than written as a literal specifier: a literal would make TypeScript resolve
 * the roster at compile time, so `tsc -b` would fail for anyone who does not
 * have the (gitignored) file.
 */

export interface RosterEntry {
  /** Row number ("Nº") on the source sheet. */
  row: number;
  name: string;
  age: number;
  /** Province as written on the sheet. Provenance only — not persisted. */
  province: string;
  /** English country name, as required by AVAILABLE_COUNTRIES. */
  country: string;
  /** Madrassa. Empty when the sheet shows a blank or a "------" placeholder. */
  school: string;
  category: string;
}

export interface DeferredEntry extends Omit<RosterEntry, "category" | "age"> {
  age: number | null;
  /** The group heading the sheet shows instead of a leaf category. */
  sheetGroup: string;
  /** The leaf categories this row could resolve to. */
  candidates: readonly string[];
}

export interface RosterModule {
  ROSTER: readonly RosterEntry[];
  DEFERRED: readonly DeferredEntry[];
}

export const ROSTER_MODULE_URL = new URL(
  "./ahlul-quran-mozambique-participants.ts",
  import.meta.url
);

export const EXAMPLE_ROSTER_MODULE_URL = new URL(
  "./ahlul-quran-mozambique-participants.example.ts",
  import.meta.url
);

export function rosterFileExists(url: URL = ROSTER_MODULE_URL): boolean {
  return existsSync(fileURLToPath(url));
}

/**
 * Loads a roster module from disk. Throws with a instruction rather than a
 * module-resolution stack trace when the file is simply absent, which is the
 * normal state of a fresh clone.
 */
export async function loadRoster(
  url: URL = ROSTER_MODULE_URL
): Promise<RosterModule> {
  if (!rosterFileExists(url)) {
    throw new Error(
      `No roster at ${fileURLToPath(url)}.\n` +
        `This file is gitignored on purpose — it holds participants' names and ` +
        `ages, and this repository is public.\n` +
        `Copy scripts/data/ahlul-quran-mozambique-participants.example.ts to ` +
        `scripts/data/ahlul-quran-mozambique-participants.ts and fill in the sheet.`
    );
  }
  // Computed specifier: keeps the gitignored file out of tsc's graph.
  const specifier = url.href;
  const loaded = (await import(specifier)) as Partial<RosterModule>;
  if (!Array.isArray(loaded.ROSTER) || !Array.isArray(loaded.DEFERRED)) {
    throw new Error(
      `${fileURLToPath(url)} must export a ROSTER array and a DEFERRED array.`
    );
  }
  return { ROSTER: loaded.ROSTER, DEFERRED: loaded.DEFERRED };
}
