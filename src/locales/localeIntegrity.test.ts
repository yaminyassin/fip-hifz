import { readFileSync } from "fs";
import path from "path";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import translationEN from "./en/translation.json";
import translationPT from "./pt/translation.json";

/**
 * Structural guards on the translation files.
 *
 * The duplicate-key case is here because it actually happened and was invisible
 * everywhere except a browser: configEditor.json defined "add" twice inside
 * questionTypes — once for the "Add question type" button, once for the "Add
 * points" operation label. JSON.parse silently keeps the last, tsc has nothing
 * to check, and every test passed. The bug only surfaced as a button in the UI
 * with the wrong words on it.
 */

const LOCALE_FILES = [
  "en/translation.json",
  "pt/translation.json",
  "en/configEditor.json",
  "pt/configEditor.json",
];

/** Walks the raw JSON text and reports any object that defines a key twice. */
function findDuplicateKeys(json: string): string[] {
  const duplicates: string[] = [];
  const pathStack: string[] = [];
  const seenStack: Array<Set<string>> = [];

  // A hand-rolled scan, because every JSON parser in the ecosystem discards
  // duplicates before we could see them.
  let index = 0;
  let pendingKey: string | null = null;

  while (index < json.length) {
    const character = json[index];

    if (character === '"') {
      let end = index + 1;
      let raw = "";
      while (end < json.length) {
        if (json[end] === "\\") {
          raw += json[end + 1];
          end += 2;
          continue;
        }
        if (json[end] === '"') break;
        raw += json[end];
        end++;
      }
      // A string is a KEY only if the next non-whitespace character is a colon.
      let lookahead = end + 1;
      while (lookahead < json.length && /\s/.test(json[lookahead])) lookahead++;
      if (json[lookahead] === ":") pendingKey = raw;
      index = end + 1;
      continue;
    }

    if (character === "{") {
      seenStack.push(new Set());
      if (pendingKey !== null) pathStack.push(pendingKey);
      pendingKey = null;
      index++;
      continue;
    }

    if (character === "}") {
      seenStack.pop();
      pathStack.pop();
      index++;
      continue;
    }

    if (character === ":" && pendingKey !== null) {
      const seen = seenStack[seenStack.length - 1];
      if (seen) {
        if (seen.has(pendingKey)) {
          duplicates.push([...pathStack, pendingKey].join("."));
        }
        seen.add(pendingKey);
      }
      index++;
      continue;
    }

    index++;
  }

  return duplicates;
}

describe("translation files are structurally sound", () => {
  for (const file of LOCALE_FILES) {
    it(`${file} defines no key twice`, () => {
      const json = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(findDuplicateKeys(json)).toEqual([]);
    });

    it(`${file} is valid JSON`, () => {
      const json = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(() => JSON.parse(json)).not.toThrow();
    });
  }

  it("the duplicate detector actually detects duplicates", () => {
    // Without this, a broken detector would report every file as clean.
    expect(
      findDuplicateKeys('{"a": {"x": 1, "y": 2, "x": 3}, "b": {"x": 1}}')
    ).toEqual(["a.x"]);
    expect(findDuplicateKeys('{"a": 1, "b": 2}')).toEqual([]);
    // A repeated key in a SIBLING object is not a duplicate.
    expect(findDuplicateKeys('{"a": {"x": 1}, "b": {"x": 1}}')).toEqual([]);
  });

  it("no leftover [MISSING] or [FALTA] placeholders", () => {
    for (const file of LOCALE_FILES) {
      const json = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(json).not.toContain("[MISSING]");
      expect(json).not.toContain("[FALTA]");
    }
  });

  it.each([
    {
      language: "en",
      translation: translationEN,
      deduction: "Max 50 pts deduction",
      addition: "Max +5 pts",
    },
    {
      language: "pt",
      translation: translationPT,
      deduction: "Máx. 50 pts de dedução",
      addition: "Máx. +5 pts",
    },
  ])("$language scoring caps include the configured amount", async ({
    language,
    translation,
    deduction,
    addition,
  }) => {
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { [language]: { translation } },
    });

    expect(i18n.t("jury.categories.maxDeduction", { cap: 50 })).toBe(
      deduction
    );
    expect(i18n.t("jury.categories.maxAddition", { cap: 5 })).toBe(addition);
  });
});
