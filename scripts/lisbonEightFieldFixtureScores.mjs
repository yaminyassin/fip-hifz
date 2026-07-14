/**
 * The exact eight-field `scores` map for Lisbon's "unchanged eight-field
 * fixture" (design section 5, "Unchanged eight-field fixture"):
 *
 *   events/lisbon-2025/scores/participant-active_jury-one_1
 *   events/lisbon-2025/scores/participant-ranking-done_jury-one_1
 *
 * `scripts/seed-firestore-emulator.mjs` (the actual seeded documents) and
 * `src/evaluation/__tests__/lisbonCompat.test.ts` (the parity guard) both
 * import this ONE object rather than each retyping the eight numeric
 * literals independently. That makes the test a byte-identity check against
 * what is actually seeded, not a hand re-creation that could silently drift
 * from it. `LISBON_EIGHT_FIELD_FIXTURE_SHA256` additionally pins a canonical
 * SHA-256 over this object's sorted-key JSON form, so an edit to the object
 * below — even one that individual field assertions don't happen to cover —
 * is still caught.
 */
export const LISBON_EIGHT_FIELD_FIXTURE_SCORES = {
  hifdh_judge_correction: 0,
  hifdh_self_correction: 1,
  hifdh_stuck_count: 0,
  tajweed_major: 0,
  tajweed_minor: 1,
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  husn_al_ada_score: 0,
};

/**
 * SHA-256 of `JSON.stringify` over the object above with keys sorted
 * alphabetically (matching `canonicalStringify` in
 * src/evaluation/configHash.ts for a flat object of primitive values).
 * Recompute with:
 *
 *   node -e 'const crypto=require("crypto");
 *     const {LISBON_EIGHT_FIELD_FIXTURE_SCORES}=await import("./scripts/lisbonEightFieldFixtureScores.mjs");
 *     const sorted=Object.fromEntries(Object.keys(LISBON_EIGHT_FIELD_FIXTURE_SCORES).sort().map(k=>[k,LISBON_EIGHT_FIELD_FIXTURE_SCORES[k]]));
 *     console.log(crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex"))'
 */
export const LISBON_EIGHT_FIELD_FIXTURE_SHA256 =
  "48b7e066489632dc84ec9a4b62003d5aabcbf043841488338a8b2997f4415cde";

