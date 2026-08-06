import type { Timestamp } from "firebase/firestore";
import { computeConfigContentHash, computeScoringFingerprint } from "./configHash";
import type { EventEvaluationConfigV2 } from "./types";

/**
 * A config as the ORGANIZER edits it: everything a human authors, and nothing
 * that is derived. The two hashes and `provisionedAt` are stamped by
 * `stampDraft` at publish time — never typed, never carried through the editor
 * state, and never trusted from an input.
 *
 * This is the type the config editor's reducer holds. Keeping the derived
 * fields out of it makes it structurally impossible for the UI to publish a
 * config whose hashes disagree with its contents.
 */
export type ConfigDraft = Omit<
  EventEvaluationConfigV2,
  "contentHash" | "scoringFingerprint" | "provisionedAt"
>;

/**
 * Derives both hashes and returns a complete, publishable config.
 *
 * Order matters: `scoringFingerprint` is itself one of the fields hashed into
 * `contentHash`, so it must be computed first. Doing this in one place is what
 * guarantees the two can never disagree.
 */
export async function stampDraft(
  draft: ConfigDraft,
  provisionedAt: Timestamp
): Promise<EventEvaluationConfigV2> {
  const scoringFingerprint = await computeScoringFingerprint(draft);
  const withoutHash = { ...draft, scoringFingerprint };
  const contentHash = await computeConfigContentHash(withoutHash);
  return { ...withoutHash, contentHash, provisionedAt };
}

/** Strips the derived fields so a published config can be edited again. */
export function draftFromConfig(config: EventEvaluationConfigV2): ConfigDraft {
  const {
    contentHash: _contentHash,
    scoringFingerprint: _scoringFingerprint,
    provisionedAt: _provisionedAt,
    ...draft
  } = config;
  void _contentHash;
  void _scoringFingerprint;
  void _provisionedAt;
  return draft;
}

/**
 * The starting point for a brand-new event: structurally valid defaults, but
 * deliberately NOT publishable — no categories and no question types, so
 * `validateEvaluationConfig` rejects it until the organizer has actually
 * defined the competition. An empty editor that silently publishes an
 * unscoreable event is the failure mode this avoids.
 */
export function emptyDraft(configVersion: string): ConfigDraft {
  return {
    schemaVersion: 2,
    configVersion,
    algorithmVersion: "jury-first-v2",
    scoring: {
      baseScorePerQuestion: 100,
      questionBounds: { min: 0, max: 105 },
      finalBounds: { min: 0, max: 110 },
      rounding: "ecmascript-math-round",
      outputDecimals: 2,
      missingQuestionPolicy: "incompleteEvaluation",
    },
    categories: {},
    questionTypes: {},
    overrideRules: [],
    participantAdjustments: {},
  };
}

/**
 * `crypto.subtle` is undefined outside a secure context. A laptop serving the
 * app over plain http on a venue LAN (http://192.168.x.x) is exactly that
 * case, and every hash-dependent path — publishing a config, deriving a score
 * document id — would throw an opaque TypeError there.
 *
 * Call this before offering the editor so the operator gets a cause, not a
 * crash. The right fix at a venue is to use localhost or serve over https.
 */
export function isSecureContextForHashing(): boolean {
  return (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined"
  );
}
