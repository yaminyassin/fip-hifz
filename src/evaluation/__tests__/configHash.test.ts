import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { computeConfigContentHash, verifyConfigContentHash } from "../configHash";
import { buildExampleEvaluationConfig } from "../exampleConfigSeed";

describe("config content hash", () => {
  it("verifies against a freshly built example config", async () => {
    const config = await buildExampleEvaluationConfig(Timestamp.now());
    expect(await verifyConfigContentHash(config)).toBe(true);
  });

  it("excludes contentHash and provisionedAt from the hash input", async () => {
    const configA = await buildExampleEvaluationConfig(Timestamp.fromDate(new Date("2026-01-01")));
    const configB = await buildExampleEvaluationConfig(Timestamp.fromDate(new Date("2030-06-15")));

    // Different provisionedAt, same everything else -> same contentHash.
    expect(configA.contentHash).toBe(configB.contentHash);

    const recomputedA = await computeConfigContentHash(configA);
    const recomputedB = await computeConfigContentHash(configB);
    expect(recomputedA).toBe(recomputedB);
    expect(recomputedA).toBe(configA.contentHash);
  });

  it("changes when a scored field changes", async () => {
    const original = await buildExampleEvaluationConfig(Timestamp.now());
    const mutated = {
      ...original,
      scoring: { ...original.scoring, baseScorePerQuestion: 99 },
    };
    const recomputed = await computeConfigContentHash(mutated);
    expect(recomputed).not.toBe(original.contentHash);
  });

  it("is independent of object key insertion order (canonicalized before hashing)", async () => {
    const config = await buildExampleEvaluationConfig(Timestamp.now());
    const reordered = {
      participantAdjustments: config.participantAdjustments,
      overrideRules: config.overrideRules,
      questionTypes: config.questionTypes,
      categories: config.categories,
      scoring: config.scoring,
      algorithmVersion: config.algorithmVersion,
      scoringFingerprint: config.scoringFingerprint,
      configVersion: config.configVersion,
      schemaVersion: config.schemaVersion,
    };
    const hashOfOriginal = await computeConfigContentHash(config);
    const hashOfReordered = await computeConfigContentHash(reordered);
    expect(hashOfReordered).toBe(hashOfOriginal);
  });
});
