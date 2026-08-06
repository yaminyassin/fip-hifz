import { semanticProjection } from "./configSemantics";
import {
  CANONICAL_CONFIG_HASH_FIELDS,
  SCORING_FINGERPRINT_FIELDS,
  type EventEvaluationConfigV2,
} from "./types";

/**
 * Deterministically serializes a JSON-safe value with sorted object keys at
 * every level, so the same logical config always produces the same string
 * regardless of property insertion order (Firestore reads and hand-authored
 * fixtures may differ in insertion order).
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    // Firestore Timestamp-like objects: canonicalize by their comparable
    // seconds/nanoseconds shape rather than relying on key order.
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    // Null-prototype accumulator so an own "__proto__" key (a legal config
    // record id from JSON/Firestore) becomes a real data property instead of
    // invoking Object.prototype's setter and vanishing from the hash.
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of sortedKeys) {
      out[key] = canonicalize(record[key]);
    }
    return out;
  }
  return value;
}

/** The exact object hashed into `contentHash`: the nine canonical fields,
 * in canonical field order, excluding `contentHash` and `provisionedAt`. */
export function extractCanonicalHashInput(
  config: Pick<
    EventEvaluationConfigV2,
    (typeof CANONICAL_CONFIG_HASH_FIELDS)[number]
  >
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of CANONICAL_CONFIG_HASH_FIELDS) {
    out[field] = config[field];
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Computes the canonical SHA-256 `contentHash` for a config, per
 * docs/migrations/phase-1-evaluation-model.md section 2 ("Configuration
 * contract"). `contentHash` itself and `provisionedAt` are excluded from the
 * hash input.
 */
export async function computeConfigContentHash(
  config: Pick<
    EventEvaluationConfigV2,
    (typeof CANONICAL_CONFIG_HASH_FIELDS)[number]
  >
): Promise<string> {
  const canonicalInput = extractCanonicalHashInput(config);
  return sha256Hex(canonicalStringify(canonicalInput));
}

/**
 * Hashes the config's SEMANTIC PROJECTION, not the raw scoring fields: labels
 * and asset references are stripped first (see configSemantics.ts). A display
 * label is not part of what a score means, and hashing it meant that fixing a
 * typo mid-competition invalidated every score already recorded.
 *
 * `contentHash` still covers the config verbatim, so a cosmetic edit remains a
 * detectable change — it just isn't a rescoring one.
 */
export async function computeScoringFingerprint(
  config: Pick<
    EventEvaluationConfigV2,
    (typeof SCORING_FINGERPRINT_FIELDS)[number]
  >
): Promise<string> {
  return sha256Hex(canonicalStringify(semanticProjection(config)));
}

/** Recomputes the hash from a fully stamped config and compares it with the
 * stored `contentHash`. Readers must reconstruct the same hash input before
 * trusting a loaded config. */
export async function verifyConfigContentHash(
  config: EventEvaluationConfigV2
): Promise<boolean> {
  const recomputed = await computeConfigContentHash(config);
  return recomputed === config.contentHash;
}
