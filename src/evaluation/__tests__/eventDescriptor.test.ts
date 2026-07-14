import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { loadEvaluationConfig, type EvaluationConfigReaders } from "../eventDescriptor";
import { buildLisbonEvaluationConfig, LISBON_CONFIG_VERSION } from "../lisbonConfigSeed";
import { buildTrialWeightedConfig } from "./fixtures";
import { computeConfigContentHash } from "../configHash";

const PROVISIONED_AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

function lisbonDescriptor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    evaluation: {
      schemaVersion: 2,
      mode: "legacy-lisbon-display-v1",
      configVersion: LISBON_CONFIG_VERSION,
      configPath: "events/lisbon-2025/app_config/evaluation",
      // Filled in per-test once the bundled config's real hash is known.
      contentHash: "",
      scoringFingerprint: "",
      provisionedBy: "offline-admin-sdk",
      provisionedAt: PROVISIONED_AT,
      ...overrides,
    },
  };
}

describe("loadEvaluationConfig: Lisbon bundled fallback", () => {
  it("falls back only when configPath is missing/unreadable for the allowlisted valid Lisbon descriptor", async () => {
    const bundled = await buildLisbonEvaluationConfig(PROVISIONED_AT);
    const eventDoc = lisbonDescriptor({
      contentHash: bundled.contentHash,
      scoringFingerprint: bundled.scoringFingerprint,
    });

    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => undefined, // missing/unreadable
    };

    const result = await loadEvaluationConfig("lisbon-2025", readers);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.source).toBe("bundledLisbonFallback");
      expect(result.config.configVersion).toBe(LISBON_CONFIG_VERSION);
    }
  });

  it("does not fall back for a non-allowlisted event with a missing configPath document", async () => {
    const bundled = await buildLisbonEvaluationConfig(PROVISIONED_AT);
    const eventDoc = lisbonDescriptor({
      contentHash: bundled.contentHash,
      scoringFingerprint: bundled.scoringFingerprint,
    });
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => undefined,
    };

    const result = await loadEvaluationConfig("some-other-event", readers);
    expect(result.status).toBe("failClosed");
  });

  it("does not fall back when the descriptor mode is not legacy-lisbon-display-v1", async () => {
    const bundled = await buildLisbonEvaluationConfig(PROVISIONED_AT);
    const eventDoc = lisbonDescriptor({
      mode: "jury-first-v2",
      contentHash: bundled.contentHash,
      scoringFingerprint: bundled.scoringFingerprint,
    });
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => undefined,
    };

    const result = await loadEvaluationConfig("lisbon-2025", readers);
    expect(result.status).toBe("failClosed");
  });

  it("does not fall back for an unknown configVersion", async () => {
    const eventDoc = lisbonDescriptor({
      configVersion: "some-unknown-version",
      contentHash: "irrelevant",
      scoringFingerprint: "irrelevant",
    });
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => undefined,
    };

    const result = await loadEvaluationConfig("lisbon-2025", readers);
    expect(result.status).toBe("failClosed");
  });

  // F4: the fallback previously verified only `contentHash` against the
  // descriptor. `scoringFingerprint` is a separate stamped field and must
  // independently match, or a bundled config whose fingerprint drifted from
  // the descriptor (while somehow sharing its content hash) would silently
  // activate.
  it("fails closed when the bundled fallback's scoringFingerprint does not match the descriptor (even with a matching contentHash)", async () => {
    const bundled = await buildLisbonEvaluationConfig(PROVISIONED_AT);
    const eventDoc = lisbonDescriptor({
      contentHash: bundled.contentHash,
      scoringFingerprint: "not-the-real-fingerprint",
    });
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => undefined,
    };

    const result = await loadEvaluationConfig("lisbon-2025", readers);
    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") {
      expect(result.reason).toContain("scoring fingerprint");
    }
  });
});

describe("loadEvaluationConfig: fail-closed cases", () => {
  it("fails closed when the event document does not exist", async () => {
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => undefined,
      getConfigDocument: async () => undefined,
    };
    const result = await loadEvaluationConfig("missing-event", readers);
    expect(result.status).toBe("failClosed");
  });

  it("fails closed on a missing evaluation descriptor, even for the Lisbon allowlist (never triggers fallback)", async () => {
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => ({ name: "Lisbon 2025" }), // no `evaluation` field
      getConfigDocument: async () => undefined,
    };
    const result = await loadEvaluationConfig("lisbon-2025", readers);
    expect(result.status).toBe("failClosed");
  });

  it("fails closed on a malformed descriptor", async () => {
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => ({ evaluation: { schemaVersion: 1 } }),
      getConfigDocument: async () => undefined,
    };
    const result = await loadEvaluationConfig("lisbon-2025", readers);
    expect(result.status).toBe("failClosed");
  });

  it("fails closed when the loaded config document is invalid (does not trigger fallback)", async () => {
    const eventDoc = lisbonDescriptor({
      contentHash: "whatever",
      scoringFingerprint: "whatever",
    });
    const readers: EvaluationConfigReaders = {
      getEventDocument: async () => eventDoc,
      getConfigDocument: async () => ({ schemaVersion: 2 }), // present but invalid
    };
    const result = await loadEvaluationConfig("lisbon-2025", readers);
    expect(result.status).toBe("failClosed");
    if (result.status === "failClosed") {
      expect(result.reason).toContain("failed validation");
    }
  });

  it("fails closed on a config/descriptor hash mismatch", async () => {
    const config = buildTrialWeightedConfig();
    const contentHash = await computeConfigContentHash(config);
    const stampedConfig = { ...config, contentHash };

    const eventDoc = {
      evaluation: {
        schemaVersion: 2,
        mode: "jury-first-v2",
        configVersion: config.configVersion,
        configPath: "events/trial-weighted-2026/app_config/evaluation",
        contentHash: "not-the-real-hash",
        scoringFingerprint: config.scoringFingerprint,
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
});

describe("loadEvaluationConfig: valid V2 event (no fallback involved)", () => {
  it("loads and verifies a native V2 config from configPath", async () => {
    const config = buildTrialWeightedConfig();
    const contentHash = await computeConfigContentHash(config);
    const stampedConfig = { ...config, contentHash };

    const eventDoc = {
      evaluation: {
        schemaVersion: 2,
        mode: "jury-first-v2",
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
      getConfigDocument: async () => stampedConfig,
    };
    const result = await loadEvaluationConfig("trial-weighted-2026", readers);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.source).toBe("configPath");
      expect(result.config.configVersion).toBe("trial-weighted-2026-v1");
    }
  });
});
