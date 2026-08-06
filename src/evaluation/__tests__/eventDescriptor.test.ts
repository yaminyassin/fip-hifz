import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { loadEvaluationConfig, type EvaluationConfigReaders } from "../eventDescriptor";
import { buildTrialWeightedConfig } from "./fixtures";
import {
  computeConfigContentHash,
  computeScoringFingerprint,
} from "../configHash";
import type { EventEvaluationConfigV2 } from "../types";

const PROVISIONED_AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

async function stampConfig(
  config: EventEvaluationConfigV2
): Promise<EventEvaluationConfigV2> {
  const scoringFingerprint = await computeScoringFingerprint(config);
  const withFingerprint = { ...config, scoringFingerprint };
  return {
    ...withFingerprint,
    contentHash: await computeConfigContentHash(withFingerprint),
  };
}

describe("loadEvaluationConfig: fail-closed cases (greenfield — no fallback of any kind)", () => {
  it("fails closed when the event document does not exist", async () => {
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => undefined,
      getConfigDocument: async () => undefined,
    };
    const result = await loadEvaluationConfig("missing-event", readers);
    expect(result.status).toBe("failClosed");
  });

  it("fails closed on a missing evaluation descriptor", async () => {
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => ({ name: "Some Event" }), // no `evaluation` field
      getConfigDocument: async () => undefined,
    };
    const result = await loadEvaluationConfig("unconfigured-event", readers);
    expect(result.status).toBe("failClosed");
  });

  it("fails closed on a malformed descriptor", async () => {
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => ({ evaluation: { schemaVersion: 1 } }),
      getConfigDocument: async () => undefined,
    };
    const result = await loadEvaluationConfig("some-event", readers);
    expect(result.status).toBe("failClosed");
  });

  it("fails closed when descriptor provisionedAt is not Timestamp-like", async () => {
    let configRead = false;
    const result = await loadEvaluationConfig("some-event", {
      getEventDocument: async () => ({
        evaluation: {
          schemaVersion: 2,
          mode: "jury-first-v2",
          configVersion: "v1",
          configPath: "events/some-event/app_config/evaluation",
          contentHash: "hash",
          scoringFingerprint: "fingerprint",
          provisionedBy: "offline-admin-sdk",
          provisionedAt: "not-a-timestamp",
        },
      }),
      getConfigDocument: async () => {
        configRead = true;
        return undefined;
      },
    });
    expect(result.status).toBe("failClosed");
    expect(configRead).toBe(false);
  });

  it.each([
    { seconds: 1, nanoseconds: 0 },
    { _seconds: 1, _nanoseconds: 0 },
  ])("fails closed on a plain timestamp-shaped descriptor map: %o", async (provisionedAt) => {
    let configRead = false;
    const result = await loadEvaluationConfig("some-event", {
      getEventDocument: async () => ({
        evaluation: {
          schemaVersion: 2,
          mode: "jury-first-v2",
          configVersion: "v1",
          configPath: "events/some-event/app_config/evaluation",
          contentHash: "hash",
          scoringFingerprint: "fingerprint",
          provisionedBy: "offline-admin-sdk",
          provisionedAt,
        },
      }),
      getConfigDocument: async () => {
        configRead = true;
        return undefined;
      },
    });
    expect(result.status).toBe("failClosed");
    expect(configRead).toBe(false);
  });

  it.each([
    { seconds: 1, nanoseconds: 0 },
    { _seconds: 1, _nanoseconds: 0 },
  ])("fails closed on a plain timestamp-shaped config map: %o", async (provisionedAt) => {
    const stampedConfig = await stampConfig(buildTrialWeightedConfig());
    const result = await loadEvaluationConfig("trial-weighted-2026", {
      getEventDocument: async () => ({
        evaluation: {
          schemaVersion: 2,
          mode: "jury-first-v2",
          configVersion: stampedConfig.configVersion,
          configPath: "events/trial-weighted-2026/app_config/evaluation",
          contentHash: stampedConfig.contentHash,
          scoringFingerprint: stampedConfig.scoringFingerprint,
          provisionedBy: "offline-admin-sdk",
          provisionedAt: PROVISIONED_AT,
        },
      }),
      getConfigDocument: async () => ({ ...stampedConfig, provisionedAt }),
    });
    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") expect(result.reason).toContain("Firestore Timestamp");
  });

  it("fails closed when configPath is missing/unreadable, even for a well-formed descriptor (no bundled fallback exists)", async () => {
    const config = buildTrialWeightedConfig();
    const eventDoc = {
      evaluation: {
        schemaVersion: 2,
        mode: "jury-first-v2",
        configVersion: config.configVersion,
        configPath: "events/trial-weighted-2026/app_config/evaluation",
        contentHash: "whatever",
        scoringFingerprint: "whatever",
        provisionedBy: "offline-admin-sdk",
        provisionedAt: PROVISIONED_AT,
      },
    };
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => undefined, // missing/unreadable
    };
    const result = await loadEvaluationConfig("trial-weighted-2026", readers);
    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") {
      expect(result.reason).toContain("missing or unreadable");
    }
  });

  it("fails closed when the loaded config document is invalid", async () => {
    const eventDoc = {
      evaluation: {
        schemaVersion: 2,
        mode: "jury-first-v2",
        configVersion: "some-version",
        configPath: "events/some-event/app_config/evaluation",
        contentHash: "whatever",
        scoringFingerprint: "whatever",
        provisionedBy: "offline-admin-sdk",
        provisionedAt: PROVISIONED_AT,
      },
    };
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => ({ schemaVersion: 2 }), // present but invalid
    };
    const result = await loadEvaluationConfig("some-event", readers);
    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") {
      expect(result.reason).toContain("failed validation");
    }
  });

  it("fails closed on a config/descriptor hash mismatch", async () => {
    const stampedConfig = await stampConfig(buildTrialWeightedConfig());

    const eventDoc = {
      evaluation: {
        schemaVersion: 2,
        mode: "jury-first-v2",
        configVersion: stampedConfig.configVersion,
        configPath: "events/trial-weighted-2026/app_config/evaluation",
        contentHash: "not-the-real-hash",
        scoringFingerprint: stampedConfig.scoringFingerprint,
        provisionedBy: "offline-admin-sdk",
        provisionedAt: PROVISIONED_AT,
      },
    };
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => stampedConfig,
    };
    const result = await loadEvaluationConfig("trial-weighted-2026", readers);
    expect(result.status).toBe("failClosed");
  });

  // F4: the loaded path previously verified schema/config version, hash,
  // and fingerprint against the descriptor, but never that
  // `config.algorithmVersion === descriptor.mode`. A config whose stamped
  // algorithm disagrees with the event's declared evaluation mode must fail
  // closed rather than silently score under the wrong algorithm.
  it("fails closed when the loaded config's algorithmVersion does not match the descriptor's mode", async () => {
    const config = { ...buildTrialWeightedConfig(), algorithmVersion: "legacy-lisbon-display-v1" as const };
    const contentHash = await computeConfigContentHash(config);
    const stampedConfig = { ...config, contentHash };

    const eventDoc = {
      evaluation: {
        schemaVersion: 2,
        mode: "jury-first-v2", // descriptor says V2...
        configVersion: config.configVersion,
        configPath: "events/trial-weighted-2026/app_config/evaluation",
        contentHash,
        scoringFingerprint: config.scoringFingerprint,
        provisionedBy: "offline-admin-sdk",
        provisionedAt: PROVISIONED_AT,
      },
    };
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      // ...but the stamped config's algorithmVersion says Lisbon legacy.
      getConfigDocument: async () => stampedConfig,
    };
    const result = await loadEvaluationConfig("trial-weighted-2026", readers);
    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") {
      expect(result.reason).toContain("algorithmVersion");
    }
  });

  it("rejects a mutually consistent legacy descriptor and config", async () => {
    const legacyBase = {
      ...buildTrialWeightedConfig(),
      algorithmVersion: "legacy-lisbon-display-v1" as const,
    };
    const scoringFingerprint = await computeScoringFingerprint(legacyBase);
    const legacyWithFingerprint = { ...legacyBase, scoringFingerprint };
    const legacyConfig = {
      ...legacyWithFingerprint,
      contentHash: await computeConfigContentHash(legacyWithFingerprint),
    };
    let configRead = false;
    const result = await loadEvaluationConfig("trial-weighted-2026", {
      getEventDocument: async () => ({
        evaluation: {
          schemaVersion: 2,
          mode: "legacy-lisbon-display-v1",
          configVersion: legacyConfig.configVersion,
          configPath: "events/trial-weighted-2026/app_config/evaluation",
          contentHash: legacyConfig.contentHash,
          scoringFingerprint: legacyConfig.scoringFingerprint,
          provisionedBy: "offline-admin-sdk",
          provisionedAt: PROVISIONED_AT,
        },
      }),
      getConfigDocument: async () => {
        configRead = true;
        return legacyConfig;
      },
    });

    expect(result.status).toBe("failClosed");
    expect(configRead).toBe(false);
  });

  it("rejects a descriptor that points at another event's config", async () => {
    const stampedConfig = await stampConfig(buildTrialWeightedConfig());
    let configRead = false;
    const result = await loadEvaluationConfig("other-event", {
      getEventDocument: async () => ({
        evaluation: {
          schemaVersion: 2,
          mode: "jury-first-v2",
          configVersion: stampedConfig.configVersion,
          configPath: "events/trial-weighted-2026/app_config/evaluation",
          contentHash: stampedConfig.contentHash,
          scoringFingerprint: stampedConfig.scoringFingerprint,
          provisionedBy: "offline-admin-sdk",
          provisionedAt: PROVISIONED_AT,
        },
      }),
      getConfigDocument: async () => {
        configRead = true;
        return stampedConfig;
      },
    });

    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") expect(result.reason).toContain("configPath");
    expect(configRead).toBe(false);
  });

  it.each([
    ["unsupported rounding", (config: Record<string, unknown>) => {
      config.scoring = { ...(config.scoring as Record<string, unknown>), rounding: "floor" };
    }],
    ["unsupported output decimals", (config: Record<string, unknown>) => {
      config.scoring = { ...(config.scoring as Record<string, unknown>), outputDecimals: 99 };
    }],
    ["missing category label", (config: Record<string, unknown>) => {
      const categories = config.categories as Record<string, Record<string, unknown>>;
      delete categories.S.label;
    }],
    ["missing provisionedAt", (config: Record<string, unknown>) => {
      delete config.provisionedAt;
    }],
  ])("rejects a correctly restamped config with %s", async (_label, mutate) => {
    const malformed = structuredClone(buildTrialWeightedConfig()) as unknown as Record<string, unknown>;
    mutate(malformed);
    const scoringFingerprint = await computeScoringFingerprint(
      malformed as unknown as EventEvaluationConfigV2
    );
    malformed.scoringFingerprint = scoringFingerprint;
    const contentHash = await computeConfigContentHash(
      malformed as unknown as EventEvaluationConfigV2
    );
    malformed.contentHash = contentHash;

    const result = await loadEvaluationConfig("trial-weighted-2026", {
      getEventDocument: async () => ({
        evaluation: {
          schemaVersion: 2,
          mode: "jury-first-v2",
          configVersion: malformed.configVersion,
          configPath: "events/trial-weighted-2026/app_config/evaluation",
          contentHash,
          scoringFingerprint,
          provisionedBy: "offline-admin-sdk",
          provisionedAt: PROVISIONED_AT,
        },
      }),
      getConfigDocument: async () => malformed,
    });

    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") expect(result.reason).toContain("failed validation");
  });

  it("rejects stale scoring fingerprints even when contentHash is restamped", async () => {
    const stampedConfig = await stampConfig(buildTrialWeightedConfig());
    const mutatedWithStaleFingerprint = {
      ...stampedConfig,
      scoring: {
        ...stampedConfig.scoring,
        baseScorePerQuestion: stampedConfig.scoring.baseScorePerQuestion - 1,
      },
    };
    const mutatedConfig = {
      ...mutatedWithStaleFingerprint,
      contentHash: await computeConfigContentHash(mutatedWithStaleFingerprint),
    };
    const result = await loadEvaluationConfig("trial-weighted-2026", {
      getEventDocument: async () => ({
        evaluation: {
          schemaVersion: 2,
          mode: "jury-first-v2",
          configVersion: mutatedConfig.configVersion,
          configPath: "events/trial-weighted-2026/app_config/evaluation",
          contentHash: mutatedConfig.contentHash,
          scoringFingerprint: mutatedConfig.scoringFingerprint,
          provisionedBy: "offline-admin-sdk",
          provisionedAt: PROVISIONED_AT,
        },
      }),
      getConfigDocument: async () => mutatedConfig,
    });

    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") {
      expect(result.reason).toContain("recomputed scoring semantics");
    }
  });
});

describe("loadEvaluationConfig: valid V2 event", () => {
  it("loads and verifies a native V2 config from configPath", async () => {
    const stampedConfig = await stampConfig(buildTrialWeightedConfig());

    const eventDoc = {
      evaluation: {
        schemaVersion: 2,
        mode: "jury-first-v2",
        configVersion: stampedConfig.configVersion,
        configPath: "events/trial-weighted-2026/app_config/evaluation",
        contentHash: stampedConfig.contentHash,
        scoringFingerprint: stampedConfig.scoringFingerprint,
        provisionedBy: "offline-admin-sdk",
        provisionedAt: PROVISIONED_AT,
      },
    };
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => stampedConfig,
    };
    const result = await loadEvaluationConfig("trial-weighted-2026", readers);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.config.configVersion).toBe("trial-weighted-2026-v1");
    }
  });
});
