import { SCORING_FINGERPRINT_FIELDS, type EventEvaluationConfigV2 } from "./types";

/**
 * The distinction between a config edit that changes what a score MEANS and
 * one that only changes how it is LABELLED.
 *
 * `scoringFingerprint` is stamped onto every EvaluationScoreV2 and
 * JuryEvaluationInputsV2 document, and useParticipants rejects any score whose
 * fingerprint no longer matches the event descriptor. That is the right
 * behaviour for a weight change — those scores really are stale. But hashing
 * the raw config meant that fixing a typo in a category's display label also
 * changed the fingerprint, silently orphaning every score already recorded and
 * emptying the ranking mid-competition.
 *
 * So the fingerprint hashes a SEMANTIC PROJECTION: the scoring-relevant
 * fields with presentation-only properties stripped. `contentHash` still
 * covers the config verbatim, so a cosmetic edit is a real, detectable change
 * — it just isn't a rescoring one.
 *
 * Anything not listed here is scoring-relevant by default. When adding a new
 * config property, the safe thing is to leave it in the projection.
 */
const PRESENTATION_ONLY_KEYS = new Set(["label", "assetRef", "groupId"]);

function project(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(project);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (PRESENTATION_ONLY_KEYS.has(key)) continue;
      out[key] = project(record[key]);
    }
    return out;
  }
  return value;
}

/** The scoring-relevant fields with presentation-only properties removed. */
export function semanticProjection(
  config: Pick<EventEvaluationConfigV2, (typeof SCORING_FINGERPRINT_FIELDS)[number]>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of SCORING_FINGERPRINT_FIELDS) {
    out[field] = project(config[field]);
  }
  return out;
}

export type ConfigChangeKind =
  /** Byte-identical config. */
  | "none"
  /** Labels/assets only. Existing scores stay valid; republish freely. */
  | "cosmetic"
  /** Weights, caps, bounds, rules, slots. Existing scores become stale. */
  | "semantic";

/**
 * Classifies an edit by comparing a candidate config against the published
 * one. Callers use this to decide whether publishing needs a rescore
 * acknowledgement.
 *
 * Both hashes must already be stamped on both configs — call `stampDraft`
 * first. Comparing hashes rather than recomputing keeps this synchronous and
 * makes it impossible for the classification to disagree with what was
 * actually written.
 */
export function classifyConfigChange(
  published: Pick<EventEvaluationConfigV2, "contentHash" | "scoringFingerprint">,
  candidate: Pick<EventEvaluationConfigV2, "contentHash" | "scoringFingerprint">
): ConfigChangeKind {
  if (published.scoringFingerprint !== candidate.scoringFingerprint) {
    return "semantic";
  }
  if (published.contentHash !== candidate.contentHash) return "cosmetic";
  return "none";
}
