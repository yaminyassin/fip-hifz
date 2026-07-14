import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { loadEvaluationConfig, type EvaluationConfigReaders } from "../eventDescriptor";
import { buildTrialWeightedConfig } from "./fixtures";
import { computeConfigContentHash } from "../configHash";

const PROVISIONED_AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z"));

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

describe("loadEvaluationConfig: valid V2 event", () => {
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
      expect(result.config.configVersion).toBe("trial-weighted-2026-v1");
    }
  });
});
