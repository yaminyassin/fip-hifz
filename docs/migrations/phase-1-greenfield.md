# Phase 1 (greenfield): per-event configurable evaluation

This supersedes `phase-1-evaluation-model.md`. All prior events are abandoned and
will never be read again, so everything that document spends its length on —
legacy parity, offline migration, dual-read, bundled fallback, allowlists,
deploy-ordering, shadow/manifest artifacts — is **deleted**. What survives is the
committed pure engine in `src/evaluation/` and one rule: **the app is
config-driven per event, and an event with no valid config fails closed.**

The engine is done. This note is only about (a) how config is stored/loaded, (b)
how a new event is provisioned, (c) what legacy code to delete, (d) how each
consumer becomes config-driven, and (e) the trial event to build against.

## 1. Config storage model

Two documents per event, both typed by the committed `src/evaluation/types.ts`:

| Path | Committed type | Role |
|---|---|---|
| `events/{eventId}` | `EventDocumentV2` (its `.evaluation` is `EventEvaluationDescriptorV2`) | Descriptor: `mode`, `configVersion`, `configPath`, `contentHash`, `scoringFingerprint`. |
| `events/{eventId}/app_config/evaluation` | `EventEvaluationConfigV2` | The full config: `scoring`, `categories`, `questionTypes`, `overrideRules`, `participantAdjustments`. This is what `descriptor.configPath` points to. |

All new events use `mode: "jury-first-v2"`. The `"legacy-lisbon-display-v1"`
value stays in the `EvaluationMode` union (types are harmless) but no event uses
it and the compat path is deleted (§3).

**Read once, cached, fail-closed** — already implemented in
`src/contexts/EventContext.tsx` + `src/evaluation/eventDescriptor.ts`
(`loadEvaluationConfig`):

1. On `currentEvent` change, clear prior config synchronously, set status
   `loading`, one-shot `getDoc` the event doc + `configPath` doc.
2. `loadEvaluationConfig` parses the descriptor, runs `validateEvaluationConfig`,
   and verifies `schemaVersion`/`configVersion`/`contentHash`/
   `scoringFingerprint`/`algorithmVersion` against the descriptor, then
   `verifyConfigContentHash`. Any mismatch → `status: "failClosed"` with a reason.
3. Context exposes `evaluationConfig`, `evaluationConfigStatus`,
   `evaluationConfigError`.

A one-shot `getDoc` (not `onSnapshot`) is correct here: config is immutable per
event until the blocked Phase 1b editor exists. Keep it cached in context for the
session.

**Change required:** strip the fallback from `loadEvaluationConfig` —
remove `MIGRATED_LEGACY_EVENT_ALLOWLIST`, the `bundledLisbonFallback` branch, the
`buildLisbonEvaluationConfig` import, and the `source` discriminant. Missing or
unreadable `configPath` becomes `failClosed`, full stop. `getConfigDocument`'s
catch-into-`undefined` now just yields fail-closed rather than a fallback trigger.

## 2. Gating

Add one gate at the layer that owns scored UI (the authed app shell / route
wrappers around jury, participants, randomizer, big-screen):

- `status !== "ready"` and `loading` → spinner; never render tiles/scores/inputs
  from a half-loaded or absent config.
- `status === "failClosed"` → explicit error surface showing
  `evaluationConfigError`. **Never** fall through to a hardcoded default config or
  category `'A'`. The engine and `EventContext` already refuse to; the gate makes
  it visible instead of rendering nothing.
- Every consumer below reads `evaluationConfig` and may assume it is non-null
  because it only renders under a `ready` gate.

## 3. Removal list (delete now)

- `src/evaluation/lisbonCompat.ts` — only importer is its own test. Delete.
- `src/evaluation/__tests__/lisbonCompat.test.ts` — delete.
- `scripts/lisbonEightFieldFixtureScores.mjs`,
  `scripts/lisbonEvaluationDescriptorFixture.mjs` — deleted Lisbon parity fixtures;
  the emulator seed no longer depends on them.
- `src/evaluation/__tests__/lisbonEvaluationDescriptorFixture.test.ts` — delete.
- In `src/evaluation/eventDescriptor.ts`: `MIGRATED_LEGACY_EVENT_ALLOWLIST`, the
  `bundledLisbonFallback` branch, and the `source` field (§1).
- In `src/routes/participants.lazy.tsx`: `applyAdditiveLisbonBonus`, the
  `calculateFinalScore` + `fillMissingQuestionsAndCalculateAverage` scoring block
  (lines ~104, ~278–323, ~403–410, ~507–510). Scoring now comes from the engine
  (§4). The additive bonus is a config `add` adjustment, not a display hack.
- In `src/utils/scoreUtils.ts`: the hardcoded `calculateScoreLogic` and all
  `*_PENALTY` / `MAX_*_DEDUCTION` / `BASE_SCORE_PER_QUESTION` constants must no
  longer drive live scoring. Delete `calculateScoreLogic`,
  `calculateFinalScore`, `calculateSingleJuryEvaluationScore`,
  `calculateJuryAverageScore`. Keep only pure display-string helpers if still
  referenced, otherwise delete the file.
- In `src/lib/quranUtils.ts`: `categoryConfigs`, `getCategoryConfig` (and its
  fallback-to-`A`), `getQuestionConfig`, `generateRandomPage`,
  `fillMissingQuestionsAndCalculateAverage`, `fillMissingQuestionsWithPerfectScores`,
  `createPerfectQuestionScore` no longer drive live behavior. `juzToPageMap` may
  remain **only** as a build-time helper for authoring config page ranges; it must
  not be read at scoring/randomization time.

**Repurpose, don't delete:** `src/evaluation/lisbonConfigSeed.ts` becomes the
neutral example/template builder `src/evaluation/exampleConfigSeed.ts` (rename
`buildLisbonEvaluationConfig` → `buildExampleEvaluationConfig`, drop the
"bundled fallback" framing). Its `counterInput`/`category`/`slot` factories and
its `computeConfigContentHash`/fingerprint wiring are exactly what the trial
config (§5) and the provisioning script (§4) need. Its dependent engine tests
(`configHash.test.ts`, `configValidation.test.ts`, `lisbonPageRanges.test.ts`,
`eventDescriptor.test.ts`) get repointed at the renamed builder.

`src/evaluation/__tests__/fixtures.ts` is already generic `jury-first-v2` — keep.
The migration-manifest types in `types.ts` (`EvaluationMigration*`, `Migrated*`,
shadows) are dead but harmless; optional cleanup, not required.

## 4. Consumer wiring

Score storage is the committed V2 shape — **one representation, no legacy
collections.** All events store scores as `EvaluationScoreV2` in
`events/{eventId}/evaluationScores/{id}` and adjustments as
`JuryEvaluationInputsV2` in `events/{eventId}/juryEvaluationInputs/{id}`, whose
`values` are `Record<questionTypeId, Record<inputId, number>>` — exactly the
engine's `QuestionValueMap`/`AdjustmentValueMap`. This retires the flat `scores` /
`overallBonuses` collections and the nested-`overall_bonus` write anomaly.

| Consumer | Becomes config-driven by | Fail-closed |
|---|---|---|
| `EventContext` | §1 — owns load/verify/cache. | Sole source of truth; already emits `failClosed`. |
| App shell / route wrappers | §2 gate. | Blocks all scored UI until `ready`. |
| `randomizer.lazy.tsx`, `randomizer-audience.lazy.tsx` | Read `config.categories[participant.category].questionSlots[i].pageRange` and pick a random page in `[startPage, endPage]` excluding `previous_questions`. Replaces `generateRandomPage`/`getCategoryConfig`/`juzToPageMap`. Fixes the Juz-overlap bug (ranges are now authoritative). | Category absent from `config.categories` → error, not category `A`. |
| `jury.lazy.tsx`, `ScoreForm`, `ScoreCategory`, `ScoreInput`, `SliderInput` | Render one section per `config.questionTypes` (ordered by `order`), one input per section input with its `min`/`max`/`step`/`control`/`label`/weight; render `config.participantAdjustments` (the bonus slider). No hardcoded hifdh/tajweed/bonus blocks. Void warning highlight = "an `overrideRules` void rule would match current inputs" (generic, from config). | Renders only under `ready` gate. |
| `QuestionTabs` | Tab count = `config.categories[participant.category].questionCount`. | Under gate. |
| `useJuryScores`, `useJuryNavigation` | Write `EvaluationScoreV2` / `JuryEvaluationInputsV2` with nested `values` keyed by config IDs; stamp `categoryId`/`configVersion`/`scoringFingerprint`/`assignmentHash`. Stop writing nested `overall_bonus`. | Reject writes whose values fail `validateQuestionValues`/`validateAdjustmentValues`. |
| `useParticipants`, `useParticipantScores` | Subscribe to `evaluationScores` + `juryEvaluationInputs` only. Feed `scoreQuestion`→`scoreJury`→`scoreParticipant`. Keep the ranking eligibility guard (`isDone && juryIds.length > 0` → `finalScore = -1`, no rank). | `incompleteEvaluation`: a missing/duplicate/invalid question yields no final score. |
| `participants.lazy.tsx`, `ScoreDetailsDialog`, `ScoreSummary`, `ParticipantStatusTable`, `big-screen.lazy.tsx` | Consume engine results (`QuestionScoreResult.sectionImpacts`, `JuryScoreResult`, `scoreParticipant`) instead of recomputing caps/penalties. Additive overall bonus flows through the `add` adjustment inside `scoreJury` — the `applyAdditiveLisbonBonus` hack is gone. Exports use `round2` from the engine. Category filter chips enumerate `config.categories` keys, not `categoryConfigs`. | A participant whose `category` is not in `config.categories` surfaces as an error row, not silently dropped. |

## 5. Trial event to build against

Provision one new event `demo-2026`, `mode: "jury-first-v2"`, via the template
builder (§3 rename). It exercises every required feature:

**scoring:** `baseScorePerQuestion: 100`, `questionBounds: {0,105}` (headroom for
the `add` question type), `finalBounds: {0,110}` (headroom for the overall bonus),
`missingQuestionPolicy: "incompleteEvaluation"`, `outputDecimals: 2`,
`rounding: "ecmascript-math-round"`.

**categories** (page ranges authoritative):
- `CAT_A` — 2 questions: `[3,51]`, `[52,101]`.
- `CAT_B` — 3 questions: `[3,135]`, `[136,268]`, `[269,401]`.
- `CAT_M` — 2 questions: `[582,588]`, `[589,596]`.

**questionTypes** (exercises weights, a section cap, and both operations):
- `hifdh` — `subtract`, `perSectionDeductionCap: 50`. Inputs:
  `judge_correction` (weight 3), `self_correction` (weight 2), `stuck`
  (informational). All counters min 0 / max 10 / step 1.
- `tajweed` — `subtract`, `perSectionDeductionCap: 30`. Inputs: `major`
  (weight 2), `minor` (weight 1).
- `presentation` — **`add`**, `perSectionAdditionCap: 5`. Input: `fluency`
  (weight 1, min 0 / max 5 / step 1). Demonstrates a positive question section.

**overrideRules:** `hifdh.judge_correction gte 3 → voidQuestion` (priority 1) —
the void rule.

**participantAdjustments:** `overall_bonus` — **`add`**, `additionCap: 5`, input
`bonus` (slider, min 0 / max 5 / step 1, weight 1) — the additive bonus.

**Provisioning script** (`scripts/provision-event.mts`) uses the existing
`firebase-admin` development dependency. `FIRESTORE_EMULATOR_HOST` selects the
Firestore emulator; otherwise the CLI targets the selected real project through
Application Default Credentials. It runs
`buildExampleEvaluationConfig(provisionedAt)` →
`validateEvaluationConfig` (abort on failure — fail-closed provisioning) → one
batch that writes `events/demo-2026/app_config/evaluation` (the config) and
`events/demo-2026` (the descriptor, with `contentHash`/`scoringFingerprint` from
the builder), then seeds representative participants whose categories and
assigned pages come from the config plus one jury member. The emulator seed also
writes the config document. It retains an `unconfigured-event` fixture only to
prove fail-closed behavior; no bundled-fallback fixture or fallback path remains.

## 6. Open risks

- **V2 collection cutover is the real work.** `useParticipants`,
  `useParticipantScores`, `useJuryScores`, `useJuryNavigation` all move off the
  flat `scores`/`overallBonuses` collections to the nested V2 shape — the largest
  churn and regression surface in this phase.
- **Config immutability is by convention, not enforcement.** No auth/rules and no
  freeze until the blocked Phase 1b editor/auth work; the one-shot cached read assumes
  nobody edits the config mid-session. Acceptable while there is no editor.
- **`assignmentHash` on reassignment/reset.** A native V2 reader fails closed if a
  participant's category/assignment no longer matches stored provenance; reset must
  clear V2 docs before reassigning. Not enforceable against direct clients until the
  blocked Phase 1b auth/rules work.
- **Bounds vs additive headroom.** With `add` question types/adjustments,
  `questionBounds.max`/`finalBounds.max` must leave room or bonuses are silently
  clamped away. The trial config deliberately sets 105/110; real configs must too.
- **Random page exclusion exhaustion.** Ranges are now authoritative (good), but
  the exclude-`previous_questions` path still needs a defined behavior when a
  range is exhausted (reuse vs error) and still uses `Math.random`.
- **Category coverage.** Any participant whose `category` is missing from
  `config.categories` must be an explicit error everywhere (scoring, randomizer,
  filters), never a silent drop or a fallback.
- **Assets.** `categoryImageMap` is still hardcoded in the randomizers; the config
  category asset ref (URL/path) should replace it, but actual asset storage is
  Phase 2 — config just holds the ref for now.
