import { validateEvaluationConfig } from "./configValidation";
import { verifyConfigContentHash } from "./configHash";
import { buildLisbonEvaluationConfig, LISBON_CONFIG_VERSION } from "./lisbonConfigSeed";
import type { EventEvaluationConfigV2, EventEvaluationDescriptorV2 } from "./types";

/**
 * Config loading seam, per docs/migrations/phase-1-evaluation-model.md
 * section 2 ("Event metadata and config loading"). Pure orchestration over
 * caller-supplied readers so it can be exercised against the Firestore
 * emulator (real reader) or in-memory fixtures (fake reader) without this
 * module importing the Firebase SDK itself.
 *
 * "Never fall back to category 'A'": this module has no notion of
 * participant categories at all. The only fallback it performs is the one
 * explicit trigger below, and only for the Lisbon allowlist entry.
 */

/** The initial Phase 1a allowlist. Only `lisbon-2025` may use the bundled
 * fallback config, and only when every other condition below also holds. */
export const MIGRATED_LEGACY_EVENT_ALLOWLIST: readonly string[] = ["lisbon-2025"];

export interface EvaluationConfigReaders {
  /** Resolves the event document's raw data, or `undefined` if the event
   * document does not exist. */
  getEventDocument: () => Promise<unknown | undefined>;
  /** Resolves the document at `configPath`, or `undefined` if it is missing
   * or unreadable (the caller must catch and swallow read errors into
   * `undefined` — this is the ONLY fallback trigger). */
  getConfigDocument: (configPath: string) => Promise<unknown | undefined>;
}

export type LoadEvaluationConfigResult =
  | {
      status: "ready";
      descriptor: EventEvaluationDescriptorV2;
      config: EventEvaluationConfigV2;
      source: "configPath" | "bundledLisbonFallback";
    }
  | {
      status: "failClosed";
      reason: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural validation of the descriptor shape only (not the config it
 * points to). A malformed or absent descriptor always fails closed and
 * never triggers the bundled fallback. */
function parseDescriptor(
  eventDoc: unknown
): EventEvaluationDescriptorV2 | null {
  if (!isPlainObject(eventDoc)) return null;
  const evaluation = eventDoc.evaluation;
  if (!isPlainObject(evaluation)) return null;

  if (evaluation.schemaVersion !== 2) return null;
  if (
    evaluation.mode !== "legacy-lisbon-display-v1" &&
    evaluation.mode !== "jury-first-v2"
  ) {
    return null;
  }
  if (typeof evaluation.configVersion !== "string" || evaluation.configVersion === "") {
    return null;
  }
  if (typeof evaluation.configPath !== "string" || evaluation.configPath === "") {
    return null;
  }
  if (typeof evaluation.contentHash !== "string" || evaluation.contentHash === "") {
    return null;
  }
  if (
    typeof evaluation.scoringFingerprint !== "string" ||
    evaluation.scoringFingerprint === ""
  ) {
    return null;
  }
  if (evaluation.provisionedBy !== "offline-admin-sdk") return null;
  if (!evaluation.provisionedAt) return null;

  return evaluation as unknown as EventEvaluationDescriptorV2;
}

/**
 * Loads and validates one event's evaluation config, per the six rules in
 * the design's "Config loading" section: resolve the event document,
 * require a valid descriptor, load `configPath`, validate at the boundary,
 * verify schema/config version/hash/fingerprint/algorithmVersion against the
 * descriptor (including that `algorithmVersion === descriptor.mode`), and
 * fail closed on any mismatch. The bundled Lisbon fallback fires only when
 * `configPath` is missing/unreadable AND the event is the allowlisted,
 * valid, known-version Lisbon descriptor — and is itself re-verified against
 * the descriptor's `scoringFingerprint` and `mode`, not just `contentHash`.
 */
export async function loadEvaluationConfig(
  eventId: string,
  readers: EvaluationConfigReaders
): Promise<LoadEvaluationConfigResult> {
  const eventDoc = await readers.getEventDocument();
  if (eventDoc === undefined) {
    return { status: "failClosed", reason: `event "${eventId}" document not found` };
  }

  const descriptor = parseDescriptor(eventDoc);
  if (!descriptor) {
    return {
      status: "failClosed",
      reason: `event "${eventId}" has a missing or malformed evaluation descriptor`,
    };
  }

  const rawConfig = await readers.getConfigDocument(descriptor.configPath);

  if (rawConfig === undefined) {
    const isAllowlistedLisbon =
      eventId === "lisbon-2025" &&
      MIGRATED_LEGACY_EVENT_ALLOWLIST.includes(eventId) &&
      descriptor.mode === "legacy-lisbon-display-v1" &&
      descriptor.configVersion === LISBON_CONFIG_VERSION;

    if (!isAllowlistedLisbon) {
      return {
        status: "failClosed",
        reason: `configPath "${descriptor.configPath}" is missing or unreadable and no fallback applies to event "${eventId}"`,
      };
    }

    const bundled = await buildLisbonEvaluationConfig(descriptor.provisionedAt);
    if (bundled.contentHash !== descriptor.contentHash) {
      return {
        status: "failClosed",
        reason: "bundled Lisbon fallback content hash does not match the event descriptor",
      };
    }
    if (bundled.scoringFingerprint !== descriptor.scoringFingerprint) {
      return {
        status: "failClosed",
        reason: "bundled Lisbon fallback scoring fingerprint does not match the event descriptor",
      };
    }
    if (bundled.algorithmVersion !== descriptor.mode) {
      return {
        status: "failClosed",
        reason: "bundled Lisbon fallback algorithmVersion does not match the event descriptor mode",
      };
    }
    return {
      status: "ready",
      descriptor,
      config: bundled,
      source: "bundledLisbonFallback",
    };
  }

  const validation = validateEvaluationConfig(rawConfig);
  if (!validation.ok || !validation.config) {
    return {
      status: "failClosed",
      reason: `config at "${descriptor.configPath}" failed validation: ${validation.errors.join("; ")}`,
    };
  }
  const config = validation.config;

  if (config.schemaVersion !== descriptor.schemaVersion) {
    return { status: "failClosed", reason: "config schemaVersion does not match event descriptor" };
  }
  if (config.configVersion !== descriptor.configVersion) {
    return { status: "failClosed", reason: "config configVersion does not match event descriptor" };
  }
  if (config.scoringFingerprint !== descriptor.scoringFingerprint) {
    return {
      status: "failClosed",
      reason: "config scoringFingerprint does not match event descriptor",
    };
  }
  if (config.contentHash !== descriptor.contentHash) {
    return { status: "failClosed", reason: "config contentHash does not match event descriptor" };
  }
  if (config.algorithmVersion !== descriptor.mode) {
    return {
      status: "failClosed",
      reason: "config algorithmVersion does not match event descriptor mode",
    };
  }
  if (!(await verifyConfigContentHash(config))) {
    return {
      status: "failClosed",
      reason: "config contentHash does not match its own recomputed canonical hash",
    };
  }

  return { status: "ready", descriptor, config, source: "configPath" };
}
