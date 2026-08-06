import {
  isTimestampLike,
  validateEvaluationConfig,
} from "./configValidation";
import {
  computeScoringFingerprint,
  verifyConfigContentHash,
} from "./configHash";
import {
  PROVISIONED_BY_VALUES,
  type EventEvaluationConfigV2,
  type EventEvaluationDescriptorV2,
  type ProvisionedBy,
} from "./types";

/**
 * Config loading seam, per docs/migrations/phase-1-greenfield.md section 1
 * ("Config storage model"). Pure orchestration over caller-supplied readers
 * so it can be exercised against the Firestore emulator (real reader) or
 * in-memory fixtures (fake reader) without this module importing the
 * Firebase SDK itself.
 *
 * Greenfield rule: there is no fallback of any kind. An event with a
 * missing/malformed descriptor, or whose `configPath` document is
 * missing/unreadable/invalid, or whose stamped fields don't match the
 * descriptor, always fails closed. This module has no notion of participant
 * categories at all — "never fall back to category 'A'" holds trivially
 * because there is nothing here that could produce a category.
 */

export interface EvaluationConfigReaders {
  /** Resolves the event document's raw data, or `undefined` if the event
   * document does not exist. */
  getEventDocument: () => Promise<unknown | undefined>;
  /** Resolves the document at `configPath`, or `undefined` if it is missing
   * or unreadable (the caller must catch and swallow read errors into
   * `undefined`). */
  getConfigDocument: (configPath: string) => Promise<unknown | undefined>;
}

export type LoadEvaluationConfigResult =
  | {
      status: "ready";
      descriptor: EventEvaluationDescriptorV2;
      config: EventEvaluationConfigV2;
    }
  | {
      status: "failClosed";
      reason: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural validation of the descriptor shape only (not the config it
 * points to). A malformed or absent descriptor always fails closed. */
function parseDescriptor(
  eventDoc: unknown
): EventEvaluationDescriptorV2 | null {
  if (!isPlainObject(eventDoc)) return null;
  const evaluation = eventDoc.evaluation;
  if (!isPlainObject(evaluation)) return null;

  if (evaluation.schemaVersion !== 2) return null;
  if (evaluation.mode !== "jury-first-v2") return null;
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
  if (
    !PROVISIONED_BY_VALUES.includes(evaluation.provisionedBy as ProvisionedBy)
  ) {
    return null;
  }
  if (!isTimestampLike(evaluation.provisionedAt)) return null;

  return evaluation as unknown as EventEvaluationDescriptorV2;
}

/**
 * Loads and validates one event's evaluation config: resolve the event
 * document, require a valid descriptor, load `configPath`, validate at the
 * boundary, verify schema/config version/hash/fingerprint/algorithmVersion
 * against the descriptor (including that `algorithmVersion === descriptor.mode`),
 * and fail closed on any mismatch. There is no fallback config and no
 * allowlist — a missing or unreadable `configPath` document always fails
 * closed.
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

  const expectedConfigPath = `events/${eventId}/app_config/evaluation`;
  if (descriptor.configPath !== expectedConfigPath) {
    return {
      status: "failClosed",
      reason: `event descriptor configPath must be ${JSON.stringify(expectedConfigPath)}`,
    };
  }

  const rawConfig = await readers.getConfigDocument(descriptor.configPath);

  if (rawConfig === undefined) {
    return {
      status: "failClosed",
      reason: `configPath "${descriptor.configPath}" is missing or unreadable for event "${eventId}"`,
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

  if (config.algorithmVersion !== "jury-first-v2") {
    return {
      status: "failClosed",
      reason: "config algorithmVersion must be jury-first-v2",
    };
  }
  const recomputedScoringFingerprint = await computeScoringFingerprint(config);
  if (config.scoringFingerprint !== recomputedScoringFingerprint) {
    return {
      status: "failClosed",
      reason: "config scoringFingerprint does not match its recomputed scoring semantics",
    };
  }

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

  return { status: "ready", descriptor, config };
}
