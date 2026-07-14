/**
 * The Lisbon bundled evaluation config's `contentHash` and
 * `scoringFingerprint`, precomputed from `src/evaluation/lisbonConfigSeed.ts`
 * (`buildLisbonEvaluationConfig`). Duplicated here as plain values (rather
 * than imported) because the seed script runs under plain Node without a
 * TypeScript loader.
 *
 * DRIFT GUARD: src/evaluation/__tests__/lisbonEvaluationDescriptorFixture.test.ts
 * recomputes the real hash/fingerprint from the TypeScript module on every
 * `npm run test:unit` run and fails if these values fall out of sync. If you
 * edit `lisbonConfigSeed.ts`'s scored fields, regenerate these two values
 * (e.g. via a temporary script that imports and calls
 * `buildLisbonEvaluationConfig`) and update both here and the drift-guard
 * test's expectations.
 */
export const LISBON_CONFIG_VERSION = "lisbon-2025-seed-v1";
export const LISBON_CONFIG_CONTENT_HASH =
  "c480ebaf8900945866d9a8ce7ec2c25a49bc2f2afb5fb7f075c9183e1b83fe93";
export const LISBON_SCORING_FINGERPRINT =
  "51f29bcab49e6392abc90f36a453e933b4ab6abc840294e971a4e16e7fddf049";
