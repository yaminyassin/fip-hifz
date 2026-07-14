import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { buildLisbonEvaluationConfig, LISBON_CONFIG_VERSION } from "../lisbonConfigSeed";
import {
  LISBON_CONFIG_CONTENT_HASH,
  LISBON_CONFIG_VERSION as FIXTURE_CONFIG_VERSION,
  LISBON_SCORING_FINGERPRINT,
  // @ts-expect-error -- plain .mjs, no type declarations.
} from "../../../scripts/lisbonEvaluationDescriptorFixture.mjs";

/**
 * Drift guard: scripts/seed-firestore-emulator.mjs stamps the Lisbon event
 * document with a hardcoded contentHash/scoringFingerprint (it cannot import
 * TypeScript directly). This test recomputes the real values from
 * `buildLisbonEvaluationConfig` and fails loudly if they've fallen out of
 * sync with the hardcoded seed fixture.
 */
describe("scripts/lisbonEvaluationDescriptorFixture.mjs stays in sync with lisbonConfigSeed.ts", () => {
  it("contentHash, scoringFingerprint, and configVersion match the computed Lisbon config", async () => {
    const config = await buildLisbonEvaluationConfig(Timestamp.now());
    expect(FIXTURE_CONFIG_VERSION).toBe(LISBON_CONFIG_VERSION);
    expect(config.configVersion).toBe(LISBON_CONFIG_VERSION);
    expect(LISBON_CONFIG_CONTENT_HASH).toBe(config.contentHash);
    expect(LISBON_SCORING_FINGERPRINT).toBe(config.scoringFingerprint);
  });
});
