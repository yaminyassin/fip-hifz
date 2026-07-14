# Phase 1a per-event evaluation model and offline migration design

Phase 1 is split into two releases. This document designs Phase 1a only.

Phase 1a introduces an offline Admin SDK migration, a per-event configurable scoring engine, and separate legacy/V2 read models. Lisbon remains on its existing legacy score collections and display algorithm. Its only intended score change is that the existing overall bonus becomes additive.

Phase 1b is deferred until the application has Firebase Authentication with claims or a trusted backend and tested production Firestore rules.

## Changes from v1/v2

| Review finding | Resolution |
|---|---|
| Final review 1: ranking eligibility and sentinel parity | Section 2 applies the current `isDone`/score-derived-jury eligibility guard before Lisbon scoring and ranking and preserves `finalScore = -1` for ineligible participants. Sections 3 and 5 distinguish diagnostic score math from displayed rank and add a completed Lisbon ranking fixture and smoke gate. |
| Final review 2: self-referential `contentHash` | Section 2 defines the exact canonical hash input, excluding `contentHash`, `provisionedAt`, and every operational or timestamp field, then stamps the resulting SHA-256. |
| Final review 3: adjudication scope | Sections 2 and 3 type the adjudication artifact, restrict it to duplicate effective score and bonus keys, and require every other blocker and every parity gate to pass before any write. |
| Final review 4: deploy ordering | Section 3 adds a hard gate requiring Lisbon’s descriptor and config to be stamped and verified before deploying the fail-closed Phase 1a client, unless the requirement is held behind a feature flag. |
| Final review 5: config-domain validation | Section 2 rejects zero-question categories, inverted bounds, non-finite rule values/actions, and a base score outside question bounds. Invalid config fails closed. |
| Final review 6: bundled-fallback trigger | Section 2 makes a missing or unreadable `configPath` document the only fallback trigger for an otherwise valid allowlisted Lisbon descriptor. |
| Final review 7: `sectionImpacts` construction | Section 2 assigns every resolved normal/override impact into `sectionImpacts` before applying its signed contribution. |
| Final review 8: bonus zero-coalescing parity | Section 2 records that `?? 0` is equivalent to the current `|| 0` over Lisbon’s validated `0..5` bonus domain. |
| Opus F1: incomplete Lisbon parity | Sections 1 and 2 specify both legacy jury-averaging paths, the completeness branch, per-field `Math.round`, and its interaction with the `>= 3` void threshold. Section 5 adds complete and incomplete fractional-average fixtures. |
| Opus F2/F4 and Codex 6: ambiguous V2 key, stale documents, collisions, and lost provenance | Section 2 defines the V2 logical key from the `pageNumber`-remapped slot, preserves every legacy document in a raw shadow, excludes stale/unassigned documents from the scoring set, models all source references, and makes duplicate effective keys cutover blockers. Section 3 verifies preserved and scoring sets separately. |
| Codex 7: unsafe numeric inputs | Section 2 requires finite values, positive weights and steps, `0 <= min <= max`, step alignment, exact stored-value validation, and impact clamping to `[0, cap]`. Invalid input fails scoring; it cannot add points. |
| Codex 8: incomplete override semantics | Section 2 replaces the open-ended override model with three fully specified actions, globally unique priorities, deterministic first-match behavior, exact `setSectionImpact` semantics, pseudocode, and combination tests. |
| Codex 9: unsafe missing-config fallback | Event metadata is atomically stamped with its evaluation mode, schema, config version, and hash. Only the explicit migrated-legacy allowlist may use the bundled Lisbon fallback. New or partial events fail closed. |
| Opus F6 and Codex 10: undefined read cost | Section 2 defines one live score representation per event. Lisbon never subscribes to V2 shadows. Comparison runs offline. Read-count and payload budgets are explicit, and the subscribed config contains no rollout controls. |
| Opus F1 and Codex 11: insufficient fixtures | Section 5 keeps the original eight-field fixture unchanged and adds separate fixtures for voiding, caps, fractional averaging, nonlinear multi-jury behavior, stale pages, duplicate keys, the embedded ninth field, and bonus jury-set semantics. |
| Codex 12: schema inconsistencies | `JuryEvaluationInputsV2` includes `categoryId`. The migration manifest is a typed, `schemaVersion`-stamped contract. |
| Opus F7: bonus jury-set ambiguity | Lisbon derives its bonus jury set only from legacy score documents and uses `overallBonuses?.[juryId] ?? 0`. Bonus-only juries are excluded; scored juries without a bonus contribute zero. |
| Opus F8: unsafe migration precedent | Section 3 copies only the backup → migrate → verify skeleton of `migrate_to_event_structure.py`. Dry-run is the default, apply is non-interactive, and the tool contains no deletion path. |
| Opus F3/F5 and Codex 1–5: unenforceable editing, freeze, archives, publication, and rollback | These are removed from Phase 1a. Phase 1a has no in-app config writer. Auth-dependent editor, enforced freeze, immutable archives, atomic publication, and rollback that removes the additive bonus are deferred to Phase 1b. |

## 1. Current model

### Firestore data and security boundary

Competition data is event-scoped through `getEventCollectionPath` (`src/utils/firebaseUtils.ts:1-13`).

| Path | Current role |
|---|---|
| `events/{eventId}` | Untyped event metadata. |
| `events/{eventId}/app_config/auth_settings` | Plaintext event password. |
| `events/{eventId}/app_config/previous_questions` | Event-global page exclusion history. |
| `events/{eventId}/participants/{participantId}` | Participant identity, leaf category, ordered `assignedQuestions`, and state. |
| `events/{eventId}/jury/{juryId}` | Jury progress and active/completed state. |
| `events/{eventId}/scores/{participantId}_{juryId}_{questionNumber}` | One legacy question score. |
| `events/{eventId}/overallBonuses/{participantId}_{juryId}` | One participant/jury bonus. |
| `quran/{pageNumber}` | Root-level Quran page payload. |

There is no trusted application authentication boundary:

- `useAuth` compares a user-supplied password with plaintext Firestore data and records success in `sessionStorage` (`src/hooks/useAuth.tsx:15-27,48-84`).
- `firestore.rules` permits all access only before 2024-12-24 and therefore denies current client traffic as written (`firestore.rules:15-16`).
- Emulator rules allow all access (`firestore.test.rules:1-9`).
- `firebase.json` configures hosting and Firestore, with no trusted backend (`firebase.json:1-31`).

The Admin SDK bypasses Firestore rules. It is therefore suitable for the Phase 1a offline migration, but Phase 1a cannot claim that client-visible configuration is protected from direct tampering. Its structural freeze means only that the application contains no config editing or publication path.

### Legacy score shapes

The intended score map has eight fields (`src/models/models.ts:13-55`):

```ts
interface LegacyQuestionFields {
  hifdh_judge_correction: number;
  hifdh_self_correction: number;
  hifdh_stuck_count: number;
  tajweed_major: number;
  tajweed_minor: number;
  waqf_ibtida_incorrect: number;
  waqf_ibtida_meaning: number;
  husn_al_ada_score: number;
}

interface LegacyScore {
  participantId: string;
  juryId: string;
  questionNumber: number;
  pageNumber: number;
  scores: LegacyQuestionFields;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface LegacyOverallBonus {
  participantId: string;
  juryId: string;
  overallBonus: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Although TypeScript declares an `id` data field, normal writers do not consistently store it. Document paths and Firestore document IDs are authoritative (`src/services/scores.ts:49-86`; `src/hooks/useJuryScores.tsx:119-185`).

Finishing a jury evaluation currently inserts `overall_bonus` into the nested question map before saving (`src/hooks/useJuryNavigation.tsx:194-209`). This produces a ninth-field anomaly. Existing documents with this field must be preserved exactly. The separate `overallBonuses` collection remains authoritative for bonus calculation.

### Category and page generation

Category configuration is compile-time TypeScript (`src/lib/quranUtils.ts:38-99`). Participants store fourteen leaf IDs, but `getCategoryConfig` derives the group from the first character and silently falls back to category A for unknown input (`src/lib/quranUtils.ts:145-155`).

Page generation:

1. Resolves the start page from the first Juz and the end page from the last Juz.
2. Computes `floor(totalPages / numParts)`.
3. Assigns any remainder to the final partition.
4. Excludes pages already used by the event.
5. Reuses an excluded page if the partition is exhausted.

The Juz map contains overlapping fractional entries. Juz `2.5` ends at page 53, while Juz `3` starts at page 42 and ends at 61 (`src/lib/quranUtils.ts:3-36`). Explicit page ranges must therefore be authoritative in the new model.

### Legacy question scoring

For a non-void question, the current scorer implements (`src/utils/scoreUtils.ts:17-204`):

```text
hifdhImpact =
  min(50,
      3 × hifdh_judge_correction
    + 2 × hifdh_self_correction)

tajweedImpact =
  min(30,
      2 × tajweed_major
    + 1 × tajweed_minor)

waqfImpact =
  min(10,
      0.3 × waqf_ibtida_incorrect
    + 0.7 × waqf_ibtida_meaning)

husnImpact =
  min(10,
      1 × husn_al_ada_score)

questionScore =
  max(0, 100 - hifdhImpact - tajweedImpact - waqfImpact - husnImpact)
```

`hifdh_stuck_count` is informational. If `hifdh_judge_correction >= 3`, the whole question scores zero and all remaining section calculations are skipped (`src/utils/scoreUtils.ts:22,80-151`). The comment describing a four-mistake rule is wrong; the implemented threshold is three.

Every supplied question, including a void question, remains in the denominator. Missing expected questions are normally represented by eight zero inputs and therefore score 100 (`src/lib/quranUtils.ts:238-346`).

### The two Lisbon averaging paths

The displayed participant path contains two materially different raw-field averaging implementations.

`calculateAverageScores` (`src/hooks/useParticipantScores.ts:26-76`) does the following:

1. Finds every question number present for at least one jury.
2. Averages each field across only the juries that supplied that question.
3. Uses ordinary floating-point division.
4. Does not round the field average.

`fillMissingQuestionsAndCalculateAverage` then branches on completeness (`src/lib/quranUtils.ts:269-346`):

```text
existingQuestionCount = number of keys in calculateAverageScores result

if existingQuestionCount >= expectedQuestions:
  preserve the unrounded averages
  add perfect scores for any missing expected slot
else:
  fill every expected slot for every jury with a perfect score
  recompute each field average
  Math.round each averaged field independently
```

The rounded incomplete branch can change the void decision. With judge-correction values `2` and `3`:

```text
unrounded average = 2.5
Math.round(2.5) = 3
```

If every expected question is represented, `2.5 < 3` and the question is not void. If an unrelated question is missing, the recomputation rounds the field to `3`, and the question becomes void.

This is part of the current displayed behavior. Phase 1a must reproduce it exactly for Lisbon.

### Page remapping, stale documents, and duplicates

The score document’s stored `questionNumber` is not the effective live question slot.

`useParticipants` calculates (`src/hooks/useParticipants.ts:75-105`):

```text
actualPage = pageNumber !== undefined ? pageNumber : questionNumber
effectiveQuestionNumber =
  participant.assignedQuestions.indexOf(actualPage) + 1
```

A document whose page is no longer assigned is omitted from scoring. The jury ID is nevertheless registered before the stale-page check, so a stale score document can still add a jury to the displayed jury set.

When multiple documents for the same participant and jury remap to the same slot, their numeric fields are merged and overwritten in snapshot iteration order. The resulting display depends on source ordering. There is no safe one-document V2 projection until the collision is adjudicated.

### Bonus behavior

The participant ranking path derives its bonus jury set from `questionScores.juryIds`, not from the bonus collection (`src/routes/participants.lazy.tsx:280-295`).

For each jury represented by score documents:

```text
jury bonus = overallBonuses?.[juryId] ?? 0
```

A bonus-only jury is excluded. A scored jury without a bonus contributes zero.

The current TypeScript scorer caps and reports this bonus in the breakdown but does not add it to the final total (`src/utils/scoreUtils.ts:154-203`). Therefore:

```text
current displayed final = legacy displayed base
```

Phase 1a changes this to:

```text
new displayed final =
  round2(clamp(legacy displayed base + average jury bonus, 0, 105))
```

This is the only authorized Lisbon scoring delta.

### Current live subscriptions

`useParticipants` subscribes to the whole event’s participants, scores, and bonuses collections (`src/hooks/useParticipants.ts:158-215`). A naive V2 implementation would add another full score subscription and approximately double score reads and payload. Phase 1a must instead choose one representation for each event.

## 2. Target model

### Phase 1a boundaries

Phase 1a includes:

- Offline Admin SDK provisioning and migration.
- One validated evaluation config per event.
- Explicit per-event categories, question counts, and question-slot page ranges.
- Configurable subtractive and additive question sections.
- Positive per-input weights and per-section impact caps.
- Deterministic question-level void, fixed-score, and section-impact overrides.
- Configurable participant/jury adjustments, including additive bonus.
- Exact Lisbon legacy-display compatibility.
- V2 score documents for new events.
- Offline parity and delta reporting.

Phase 1a does not include:

- An in-app config editor.
- Client-authorized config publication.
- Enforced config freeze.
- Immutable config archives.
- Authenticated publisher identity.
- A live legacy/V2 comparison mode.
- A live rollback control that removes the additive bonus.

Lisbon’s config is created only by the offline migration or emulator seed. New events are likewise provisioned offline in Phase 1a. The existing in-app event creation action must not create a partially configured event; it is disabled or hidden until authenticated provisioning is designed.

### Firestore paths

```text
events/{eventId}
  Event metadata, including the evaluation descriptor.

events/{eventId}/app_config/evaluation
  The single subscribed Phase 1a evaluation config.

events/{eventId}/evaluationScores/{v2DocumentId}
  Native V2 question inputs for new events.
  Lisbon migration projections exist for audit only and are never subscribed live.

events/{eventId}/juryEvaluationInputs/{v2DocumentId}
  Native V2 participant/jury inputs for new events.

events/{eventId}/evaluationLegacyShadows/{sourcePathHash}
  Exact preserved shadows of every migrated legacy score and bonus document.

events/{eventId}/evaluationMigrations/{migrationId}
  A small typed migration manifest.
```

Existing Lisbon paths remain authoritative for live reads and writes:

```text
events/lisbon-2025/scores/*
events/lisbon-2025/overallBonuses/*
events/lisbon-2025/participants/*
```

No Phase 1a application component subscribes to `evaluationLegacyShadows` or Lisbon’s `evaluationScores`.

### Event metadata and config loading

```ts
type ConfigVersion = string;
type ScoringFingerprint = string;
type CategoryId = string;
type QuestionTypeId = string;
type AdjustmentTypeId = string;
type InputId = string;

type EvaluationMode =
  | "legacy-lisbon-display-v1"
  | "jury-first-v2";

interface EventEvaluationDescriptorV2 {
  schemaVersion: 2;
  mode: EvaluationMode;
  configVersion: ConfigVersion;
  configPath: string;
  contentHash: string;
  scoringFingerprint: ScoringFingerprint;
  provisionedBy: "offline-admin-sdk";
  provisionedAt: Timestamp;
}

interface EventDocumentV2 {
  name: string;
  description?: string;
  status: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  evaluation: EventEvaluationDescriptorV2;
}
```

The offline provisioner creates or updates the event descriptor and config in one Admin SDK batch. For a new event, the batch creates both documents atomically. For an existing migrated event, it uses the event snapshot update time as a precondition.

Config loading follows these rules:

1. Resolve and load the event document.
2. Require a valid `evaluation` descriptor.
3. Load `evaluation.configPath`.
4. Parse and validate the config at the Firestore boundary.
5. Verify schema version, config version, content hash, and scoring fingerprint against event metadata.
6. Mount scoring, jury, participant, randomizer, big-screen, and export consumers only after config readiness.
7. Clear the previous event’s compiled config and score state before switching events.

The bundled Lisbon fallback has one trigger: loading the document named by `event.evaluation.configPath` fails because that document is missing or unreadable. The fallback is allowed only when that trigger occurs and all of the following are true:

```text
eventId is in MIGRATED_LEGACY_EVENT_ALLOWLIST
eventId == "lisbon-2025"
event.evaluation.mode == "legacy-lisbon-display-v1"
the requested configVersion is the known Lisbon seed version
```

The initial allowlist contains only `lisbon-2025`. A malformed or absent evaluation descriptor, an invalid loaded config, a hash or fingerprint mismatch, a new event, or any V2 event fails closed. None of those cases triggers the fallback. No event silently inherits Lisbon config or falls back to category A.

### Configuration contract

```ts
interface LocalizedText {
  default: string;
  translations?: Readonly<Record<string, string>>;
}

interface PageRange {
  startPage: number; // inclusive
  endPage: number;   // inclusive
}

interface CategoryQuestionSlot {
  questionNumber: number;
  pageRange: PageRange;
  sourceJuzRange?: {
    start: number;
    end: number;
  };
}

interface EventCategoryDefinition {
  id: CategoryId;
  groupId?: string; // filtering only
  label: LocalizedText;
  order: number;
  questionCount: number;
  questionSlots: readonly CategoryQuestionSlot[];
}

interface InputDefinitionCommon {
  id: InputId;
  label: LocalizedText;
  order: number;
  control: "integerCounter" | "decimalCounter" | "slider";
  min: number;
  max: number;
  step: number;
}

interface ScoredInputDefinition extends InputDefinitionCommon {
  role: "scored";
  perInputWeight: number;
}

interface InformationalInputDefinition extends InputDefinitionCommon {
  role: "informational";
}

type EvaluationInputDefinition =
  | ScoredInputDefinition
  | InformationalInputDefinition;

interface QuestionTypeCommon {
  id: QuestionTypeId;
  label: LocalizedText;
  order: number;
  inputCount: number;
  inputs: readonly EvaluationInputDefinition[];
}

type QuestionTypeDefinition =
  | (QuestionTypeCommon & {
      operation: "subtract";
      perSectionDeductionCap: number;
    })
  | (QuestionTypeCommon & {
      operation: "add";
      perSectionAdditionCap: number;
    });

interface InputReference {
  questionTypeId: QuestionTypeId;
  inputId: InputId;
}

interface InputCondition {
  input: InputReference;
  operator: "gte" | "gt" | "eq" | "lte" | "lt";
  value: number;
}

interface RuleCondition {
  kind: "all" | "any";
  conditions: readonly InputCondition[];
}

type QuestionOverrideAction =
  | { kind: "voidQuestion" }
  | { kind: "setQuestionScore"; score: number }
  | {
      kind: "setSectionImpact";
      questionTypeId: QuestionTypeId;
      impact: number;
    };

interface QuestionOverrideRule {
  id: string;
  priority: number;
  when: RuleCondition;
  action: QuestionOverrideAction;
}

interface ParticipantAdjustmentCommon {
  id: AdjustmentTypeId;
  label: LocalizedText;
  order: number;
  scope: "participantJury";
  inputCount: number;
  inputs: readonly EvaluationInputDefinition[];
}

type ParticipantAdjustmentDefinition =
  | (ParticipantAdjustmentCommon & {
      operation: "subtract";
      deductionCap: number;
    })
  | (ParticipantAdjustmentCommon & {
      operation: "add";
      additionCap: number;
    });

interface EventEvaluationConfigV2 {
  schemaVersion: 2;
  configVersion: ConfigVersion;
  contentHash: string;
  scoringFingerprint: ScoringFingerprint;
  algorithmVersion: EvaluationMode;

  scoring: {
    baseScorePerQuestion: number;
    questionBounds: { min: number; max: number };
    finalBounds: { min: number; max: number };
    missingQuestionPolicy:
      | "zeroInputsArePerfect"
      | "incompleteEvaluation";
    outputDecimals: 2;
    rounding: "ecmascript-math-round";
  };

  categories: Readonly<Record<CategoryId, EventCategoryDefinition>>;
  questionTypes: Readonly<Record<QuestionTypeId, QuestionTypeDefinition>>;
  overrideRules: readonly QuestionOverrideRule[];
  participantAdjustments: Readonly<
    Record<AdjustmentTypeId, ParticipantAdjustmentDefinition>
  >;

  provisionedAt: Timestamp;
}
```

The config document contains no lifecycle, editor, publication, or rollout fields. Operational toggles do not belong in the subscribed scoring projection.

`configVersion` identifies the exact offline seed. The canonical SHA-256 input for `contentHash` is an object containing exactly these fields, in canonical field order:

```text
schemaVersion
configVersion
scoringFingerprint
algorithmVersion
scoring
categories
questionTypes
overrideRules
participantAdjustments
```

`contentHash` itself and `provisionedAt` are excluded. All operational and timestamp fields are excluded; under this V2 contract, `provisionedAt` is the only such config field. The provisioner canonicalizes and hashes that representation first, then stamps the resulting `contentHash` and `provisionedAt` into the stored config. Readers reconstruct the same hash input before comparing the hash with both the config and event descriptor.

`scoringFingerprint` covers categories, page slots, question counts, input definitions, weights, caps, overrides, aggregation, rounding, missing-question behavior, and participant adjustments.

There is no `COST` property.

### Config validation

The parser rejects the complete config if any of these conditions fail:

- IDs are empty or duplicated.
- `order` values are not finite integers or are duplicated within their list.
- `inputCount !== inputs.length`.
- A category’s `questionCount` is not a finite integer greater than or equal to `1`.
- A category’s `questionCount !== questionSlots.length`.
- Question numbers are not exactly `1..questionCount`.
- Page bounds are not finite integers or do not satisfy `1 <= startPage <= endPage <= 604`.
- `baseScorePerQuestion`, any input `min`, `max`, or `step`, any weight or cap, or any member of `questionBounds` or `finalBounds` is not finite.
- `questionBounds.min > questionBounds.max` or `finalBounds.min > finalBounds.max`.
- `baseScorePerQuestion` is outside the inclusive configured `questionBounds`.
- An input does not satisfy `0 <= min <= max`.
- `step <= 0`.
- A scored input has `perInputWeight <= 0`.
- An informational input carries a weight.
- A section or adjustment cap is negative.
- A condition references an unknown section or input.
- A condition’s `value` is not finite or is outside the referenced input’s range.
- An override priority is not a finite integer.
- Two override rules share a priority, even if their conditions cannot both match.
- A `setSectionImpact` target is unknown, its `impact` is not finite, or its impact is outside `[0, target cap]`.
- A `setQuestionScore` action’s `score` is not finite or is outside the configured question bounds.
- A condition list is empty.
- Config size exceeds 64 KiB in canonical serialized form.

Every stored V2 value is validated before any rule or score calculation:

- It must be a finite number.
- The enclosing section and input must exist.
- Every required input must be present exactly once.
- No unknown input or section is accepted.
- `min <= value <= max`.
- `(value - min) / step` must be integral within a fixed `1e-9` parsing tolerance.
- Informational values are validated but do not affect impact.

Any invalid config fails closed: no scorer is created and no event consumer mounts. An invalid config document does not trigger the bundled fallback.

Invalid stored data produces an explicit scoring error and no displayed total. It is never silently clamped into a valid stored value. The impact calculation still clamps to `[0, cap]` as a defensive scoring invariant:

```text
impact = clamp(rawImpact, 0, cap)
```

A negative, infinite, or `NaN` value therefore cannot add points.

### Override semantics

Override priority is global across the config. Lower numeric priority executes first. Equal priorities are invalid config.

The three actions have fixed behavior:

- `voidQuestion` is terminal. The question score becomes exactly zero. All reported section impacts become zero.
- `setQuestionScore` is terminal. The question score becomes the configured value. All reported section impacts become zero.
- `setSectionImpact` is non-terminal. It replaces, rather than adds to, the normal nonnegative impact for the named section. The section retains its configured add/subtract operation and cap.

Conditions always read the original validated input values. Earlier overrides do not change later condition inputs.

For `setSectionImpact`, the first matching rule for a section wins. Later matching section-impact rules for that same section are ignored. A later terminal action still supersedes all earlier section overrides because terminal results report zero section impacts.

This removes the configurable `terminal` boolean. Terminality is determined solely by the action variant.

### Deterministic V2 scorer

All arithmetic uses IEEE-754 binary64 in the operation order below. Sections and inputs are processed by ascending `order`; questions by ascending `questionNumber`; juries by ascending `juryId`. Record insertion order is never authoritative.

`round2` is exactly:

```ts
const round2 = (value: number) => Math.round(value * 100) / 100;
```

A non-JavaScript audit implementation must reproduce ECMAScript `Math.round`, including its tie direction, rather than using the host language’s default rounding.

```text
scoreQuestion(config, values):
  validate the complete stored value map

  for each section in ascending section order:
    rawImpact = 0
    for each scored input in ascending input order:
      rawImpact += value * perInputWeight
    normalImpact[section] = clamp(rawImpact, 0, sectionCap)

  sectionOverride = empty map

  for each override rule in ascending priority:
    if its condition does not match original values:
      continue

    if action is setSectionImpact:
      if sectionOverride does not contain the target section:
        sectionOverride[target] =
          clamp(action.impact, 0, targetSectionCap)
      continue

    if action is voidQuestion:
      return {
        score: 0,
        terminalRuleId: rule.id,
        sectionImpacts: all zero
      }

    if action is setQuestionScore:
      return {
        score: action.score,
        terminalRuleId: rule.id,
        sectionImpacts: all zero
      }

  signedTotal = 0
  sectionImpacts = empty map

  for each section in ascending section order:
    impact = sectionOverride[section] ?? normalImpact[section]
    sectionImpacts[section] = impact

    if section.operation == "subtract":
      signedTotal -= impact
    else:
      signedTotal += impact

  return {
    score: clamp(baseScorePerQuestion + signedTotal, questionBounds),
    terminalRuleId: null,
    sectionImpacts
  }
```

Canonical `jury-first-v2` aggregation is:

```text
scoreJury(config, assignedQuestions, questionScores, juryInputs):
  require exactly one valid score for every assigned question
  require score category/config/assignment provenance to match the participant

  questionResults =
    scoreQuestion for each assigned question in question-number order

  juryBase = arithmetic mean of unrounded question result scores

  signedAdjustmentTotal = 0

  for each participant/jury adjustment in ascending order:
    validate its complete value map
    rawImpact =
      sum(value × perInputWeight for scored inputs in input order)
    impact = clamp(rawImpact, 0, adjustmentCap)

    if operation == "subtract":
      signedAdjustmentTotal -= impact
    else:
      signedAdjustmentTotal += impact

  juryFinal =
    clamp(juryBase + signedAdjustmentTotal, finalBounds)

scoreParticipant(juryResults):
  participantFinal =
    round2(arithmetic mean of unrounded juryFinal values by sorted juryId)
```

New events use `incompleteEvaluation`: a missing, duplicate, stale, invalid, or provenance-mismatched V2 question prevents a final score.

### Lisbon config seed

Lisbon uses these question types:

| Type | Operation | Inputs | Section cap | Override |
|---|---|---|---:|---|
| Hifdh | subtract | judge correction `3`; self correction `2`; stuck informational | 50 | judge correction `>= 3` → `voidQuestion` |
| Tajweed | subtract | major `2`; minor `1` | 30 | none |
| Waqf/Ibtida | subtract | incorrect `0.3`; meaning `0.7` | 10 | none |
| Husn al-Ada | subtract | mistake count `1` | 10 | none |

All Lisbon counters have `min: 0`, `max: 10`, and `step: 1`, matching the current counter controls (`src/components/ui/ScoreInput.tsx:23-32,59-64`). The overall bonus has `min: 0`, `max: 5`, and `step: 1`, matching the current slider and save handler (`src/components/ui/ScoreForm.tsx:176-184`; `src/hooks/useJuryScores.tsx:243-263`).

Lisbon has one participant/jury adjustment:

| ID | Operation | Input | Weight | Cap |
|---|---|---|---:|---:|
| `overall_bonus` | add | `bonus` | 1 | 5 |

The fourteen leaf categories resolve to these exact partitions:

| Category | Source Juz | Questions | Authoritative question-slot page ranges |
|---|---:|---:|---|
| A1 | 1–5 | 2 | 3–51; 52–101 |
| A2 | 26–30 | 2 | 502–548; 549–596 |
| B1 | 1–10 | 2 | 3–101; 102–201 |
| B2 | 21–30 | 2 | 402–498; 499–596 |
| C1 | 1–20 | 3 | 3–135; 136–268; 269–401 |
| C2 | 11–30 | 3 | 202–332; 333–463; 464–596 |
| D1 | 1–30 | 3 | 3–200; 201–398; 399–596 |
| D2 | 1–30 | 3 | 3–200; 201–398; 399–596 |
| M1 | 30 | 2 | 582–588; 589–596 |
| M2 | 28 | 2 | 542–551; 552–561 |
| X | 1–2.5 | 2 | 3–27; 28–53 |
| Y | 1–15 | 3 | 3–101; 102–200; 201–301 |
| W1 | 1–3 | 3 | 3–21; 22–40; 41–61 |
| W2 | 1–30 | 3 | 3–200; 201–398; 399–596 |

`pageRange` is authoritative. `sourceJuzRange` is display and provenance metadata only. In particular, X ends at page 53 and must not expand through Juz 3.

### Exact `legacy-lisbon-display-v1`

The Lisbon compatibility algorithm reproduces the active participants/ranking path, not `calculateJuryAverageScore`.

For each participant:

```text
expectedQuestions =
  Lisbon config questionCount for the participant's explicit leaf category

juryIds = []
byJury = {}

for each legacy score document in deterministic document-path order:
  ignore documents without a score map

  if juryId has not been seen:
    append juryId
    initialize byJury[juryId]
  # This occurs before the stale-page check, matching useParticipants.

  actualPage =
    stored pageNumber if present
    otherwise stored questionNumber

  effectiveIndex =
    participant.assignedQuestions.indexOf(actualPage)

  if effectiveIndex == -1:
    mark source as stale/unassigned
    continue

  effectiveQuestionNumber = effectiveIndex + 1

  initialize the target with the eight zero fields if absent

  for each numeric source score field:
    overwrite the target field
  # Duplicate effective keys are separately detected and block cutover.
```

Apply the current ranking eligibility guard before any question scoring, bonus calculation, or rank assignment (`src/routes/participants.lazy.tsx:261-278`):

```text
rankingEligible =
  participant.isDone
  and juryIds.length > 0

if not rankingEligible:
  finalScore = -1
  breakdown = all zero
  do not calculate a displayed score
  do not assign a rank
```

A missing `questionScores.juryIds` is the same as an empty jury set. The live legacy-compatibility path stops at the sentinel. The offline audit may continue the base and bonus calculations for an ineligible participant, but those values are diagnostic only and must never replace `finalScore = -1` or enter the ranked participant set.

For an eligible participant, calculate the initial average exactly as `calculateAverageScores`:

```text
for every effective question represented by at least one jury:
  for each of the eight legacy fields:
    sum the field across juries that have that question
    divide by the number of juries that have that question
    do not round
```

Then apply the completeness branch exactly:

```text
existingQuestionCount = number of keys in initial average

if existingQuestionCount >= expectedQuestions:
  keep all existing keys and unrounded field averages
  fill any missing expected key with eight zeros
else:
  for every juryId:
    fill every missing expected question with eight zeros

  for questionNumber 1..expectedQuestions:
    for each of the eight fields:
      average the filled jury values
      apply Math.round to the field average
```

Finally run the current question scorer:

```text
for every resulting question object:
  if hifdh_judge_correction >= 3:
    question score = 0
  else:
    apply the current four section calculations and caps
    clamp question score to a minimum of 0

oldDisplayedBase =
  round2(clamp(mean(question scores), 0, 100))
```

The compatibility implementation also records unknown numeric nested fields, including `overall_bonus`, but they do not participate in the eight-field base score.

The bonus jury set is the distinct `juryIds` established from score documents above, including a jury represented only by stale score documents. It is never the union of score and bonus documents.

```text
bonusApplied =
  mean(overallBonuses?.[juryId] ?? 0 for juryId in score-derived juryIds)

newDisplayedFinal =
  round2(clamp(oldDisplayedBase + bonusApplied, 0, 105))
```

The current route uses `(overallBonuses?.[juryId] || 0)` (`src/routes/participants.lazy.tsx:285-290`). The compatibility specification uses `?? 0`; these are equivalent over the validated Lisbon bonus domain `0..5`, because zero is the only falsy valid bonus and both expressions preserve it as zero.

Every bonus value must validate against Lisbon’s `0..5` definition before activation. An invalid value is preserved and reported, but blocks cutover rather than being silently changed.

### V2 score identity and provenance

The canonical V2 score key is the page-remapped slot, not the legacy stored `questionNumber`.

For a legacy source candidate:

```text
effectiveQuestionNumber =
  participant.assignedQuestions.indexOf(source.pageNumber) + 1
```

An explicit `pageNumber` is required for the V2 scoring set. A legacy document without `pageNumber` is preserved and audited using the legacy fallback behavior, but it is not silently promoted into a V2 scoring document.

The logical key is:

```text
(participantId, juryId, effectiveQuestionNumber)
```

The implementation may encode that tuple in a delimiter-safe document ID or a canonical hash. The tuple fields remain authoritative.

```ts
interface LegacySourceReferenceV2 {
  sourcePath: string;
  sourceDocumentId: string;
  sourceSha256: string;
  shadowPath: string;

  storedQuestionNumber?: number;
  storedPageNumber?: number;
  effectiveQuestionNumber?: number;
}

interface NativeV2Source {
  kind: "nativeV2";
}

interface MigratedV2Source {
  kind: "legacyMigration";
  migrationId: string;
  sourceReferences: readonly LegacySourceReferenceV2[];
  adjudication?: {
    blockerCode:
      | "duplicate-effective-score-key"
      | "duplicate-bonus-key";
    decision: "selectSource";
    selectedSourcePath: string;
    reason: string;
    adjudicationArtifactSha256: string;
  };
}

interface EvaluationScoreV2 {
  schemaVersion: 2;
  participantId: string;
  juryId: string;
  questionNumber: number;
  pageNumber: number;

  categoryId: CategoryId;
  configVersion: ConfigVersion;
  scoringFingerprint: ScoringFingerprint;
  algorithmVersion: EvaluationMode;
  assignmentHash: string;

  values: Readonly<
    Record<QuestionTypeId, Readonly<Record<InputId, number>>>
  >;

  source: NativeV2Source | MigratedV2Source;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface JuryEvaluationInputsV2 {
  schemaVersion: 2;
  participantId: string;
  juryId: string;
  categoryId: CategoryId;

  configVersion: ConfigVersion;
  scoringFingerprint: ScoringFingerprint;
  algorithmVersion: EvaluationMode;
  assignmentHash: string;

  values: Readonly<
    Record<AdjustmentTypeId, Readonly<Record<InputId, number>>>
  >;

  source: NativeV2Source | MigratedV2Source;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

`assignmentHash` covers participant ID, category ID, and the complete ordered `assignedQuestions` array. It is a consistency check, not a security or immutability guarantee. A native V2 reader fails closed if the participant’s current category or assignment no longer matches the score provenance.

A legitimate V2 reset must clear the affected V2 question and jury-input documents before changing the assignment. Phase 1a can make the application flow consistent, but only Phase 1b can enforce this against direct clients.

### Preserved and scoring sets

The migration maintains two distinct sets.

The preserved set contains every source score and bonus document, including:

- Valid scoring inputs.
- Stale or unassigned pages.
- Missing pages.
- Unknown or ninth fields.
- Invalid numeric values.
- Missing participant or jury references.
- Duplicate effective keys.
- Duplicate logical bonus keys.

Every preserved source receives an exact raw shadow and a typed backup entry.

The scoring set contains only sources that:

- Reference an existing participant and jury.
- Have an explicit `pageNumber`.
- Map to exactly one current assigned page slot.
- Have the expected eight Lisbon fields.
- Contain finite, in-range, step-aligned values.
- Do not collide with another source at the same logical V2 key.
- Match the seeded category and config version.

A stale or unassigned source remains in the preserved set but is excluded from the scoring set. The legacy missing-question behavior may then synthesize a perfect score for the vacated slot, matching the live display.

Multiple sources that map to the same `(participantId, juryId, effectiveQuestionNumber)` are mandatory cutover blockers. Multiple bonus documents with the same `(participantId, juryId)` are also blockers. These are the only blocker classes that a typed human adjudication artifact may resolve, by identifying the selected source for the exact collision. All source references remain attached to the V2 provenance, and every rejected source remains preserved in its raw shadow. Every other blocker requires correction and a new dry-run.

### Migration manifest

```ts
type MigrationState =
  | "dryRun"
  | "blocked"
  | "applied"
  | "verified";

interface MigrationArtifactRefV2 {
  uri: string;
  sha256: string;
  byteLength: number;
}

interface MigrationSetSummaryV2 {
  sourceCount: number;
  shadowCount: number;
  projectedCount: number;
  canonicalSetSha256: string;
}

interface MigrationBlockerV2 {
  code:
    | "duplicate-effective-score-key"
    | "duplicate-bonus-key"
    | "duplicate-assigned-page"
    | "missing-page-number"
    | "invalid-input"
    | "missing-participant"
    | "missing-jury"
    | "config-mismatch"
    | "parity-failure"
    | "source-changed-during-migration";
  sourcePaths: readonly string[];
  logicalKey?: string;
  detail: string;
}

type AdjudicableMigrationBlockerCodeV2 =
  | "duplicate-effective-score-key"
  | "duplicate-bonus-key";

interface MigrationAdjudicationDecisionV2 {
  blockerCode: AdjudicableMigrationBlockerCodeV2;
  logicalKey: string;
  sourcePaths: readonly string[];
  decision: "selectSource";
  selectedSourcePath: string;
  reason: string;
}

interface EvaluationMigrationAdjudicationArtifactV2 {
  schemaVersion: 2;
  artifactVersion: 1;
  migrationId: string;
  projectId: string;
  eventId: string;
  sourceSnapshotCanonicalSha256: string;
  decisions: readonly MigrationAdjudicationDecisionV2[];
}

interface EvaluationMigrationManifestV2 {
  schemaVersion: 2;
  manifestVersion: 1;
  migrationId: string;
  migrationToolVersion: string;

  projectId: string;
  eventId: string;
  configVersion: ConfigVersion;
  scoringFingerprint: ScoringFingerprint;

  state: MigrationState;
  dryRun: boolean;

  sourceSnapshot: {
    capturedAt: Timestamp;
    canonicalSha256: string;
    collectionCounts: Readonly<Record<string, number>>;
  };

  preservedSet: MigrationSetSummaryV2;
  scoringSet: MigrationSetSummaryV2;

  anomalyCounts: Readonly<Record<string, number>>;
  blockers: readonly MigrationBlockerV2[];

  verification: {
    originalSourcesUnchanged: boolean;
    shadowsRoundTrip: boolean;
    scoringProjectionVerified: boolean;
    legacyBaseParityVerified: boolean;
    onlyBonusDeltaVerified: boolean;
  };

  artifacts: {
    typedBackup: MigrationArtifactRefV2;
    canonicalJsonReport: MigrationArtifactRefV2;
    participantCsvReport: MigrationArtifactRefV2;
    adjudication?: MigrationArtifactRefV2;
  };

  createdAt: Timestamp;
  appliedAt?: Timestamp;
  verifiedAt?: Timestamp;
}
```

An adjudication artifact is valid only when its migration, project, event, and source snapshot match the dry run; each decision matches exactly one reported collision by `blockerCode`, `logicalKey`, and the complete source-path set; the selected path belongs to that set; and every reported adjudicable collision has exactly one decision. The artifact cannot suppress, rename, or resolve any other blocker code.

Dry-run writes no Firestore manifest. It emits the same typed manifest shape locally with `state: "dryRun"` or `"blocked"`. Apply writes the small Firestore manifest only after its data batches commit.

### Live read topology and budgets

The event descriptor selects exactly one live score representation.

| Mode | Participant ranking subscriptions | Jury-detail queries |
|---|---|---|
| `legacy-lisbon-display-v1` | `participants`, `scores`, `overallBonuses`, and the single evaluation config | Legacy `scores` filtered by participant/jury plus its bonus document |
| `jury-first-v2` | `participants`, `evaluationScores`, `juryEvaluationInputs`, and the single evaluation config | V2 collections filtered by participant/jury |
| Offline audit | One-shot reads of both legacy data and V2/shadow data | Not used by the live app |

Lisbon never opens live listeners for `evaluationScores`, `juryEvaluationInputs`, or `evaluationLegacyShadows`. New events never subscribe to legacy `scores` or `overallBonuses`.

For an event with:

```text
P = participant documents
S = selected-representation question score documents
J = selected-representation jury input/bonus documents
```

the ranking screen’s initial representation read count is bounded by:

```text
P + S + J + 1 evaluation config document
```

An event metadata read may add one document if it is not already cached by event selection. No live comparison multiplier is permitted.

Additional budgets:

- Evaluation config canonical payload: at most 64 KiB.
- Native V2 question document: at most 4 KiB.
- Native V2 jury-input document: at most 2 KiB.
- One score edit produces one changed score-document read for active score listeners.
- One bonus/adjustment edit produces one changed jury-input document read.
- Lisbon’s score-representation reads remain exactly `legacy score count + legacy bonus count`.
- Lisbon’s score payload must not exceed the measured pre-Phase-1 legacy score/bonus payload; the only added initial payload is the evaluation config and, when uncached, the event metadata document.
- The offline migration report records actual legacy and V2 document counts and canonical byte sizes. Activation fails if live instrumentation observes a second representation listener or exceeds these formulas.

The existing emulator fixture has three participants, one legacy score, and one legacy bonus. Its participants ranking route therefore expects five representation documents plus one config document, and at most one event metadata read. Lisbon V2 shadows do not affect this count.

## 3. Migration strategy

### Tool contract

Create a new Admin SDK migration tool. It copies only the backup → migrate → verify structure of `scripts/migrate_to_event_structure.py`.

It must not copy:

- Module-level `DRY_RUN = False`.
- Either `input()` prompt.
- `delete_original_collection`.
- Any other delete function.
- Count-only verification.
- Stringification that loses Firestore value types.

The CLI is non-interactive:

```text
migrate-evaluation-v2
  --project-id PROJECT
  --event-id EVENT
  --config CONFIG_FILE
  --backup-dir DIRECTORY
  [--apply]
  [--adjudication ADJUDICATION_FILE]
```

Without `--apply`, the command is always a dry-run. Apply requires all explicit project, event, config, and backup arguments. Credential discovery must use an explicit credential path or standard Admin SDK environment configuration.

The migration tool contains no deletion command or deletion helper. No combination of flags deletes legacy data.

### Backup and canonical hashing

The snapshot includes:

- The event document.
- `participants`.
- `jury`.
- `scores`.
- `overallBonuses`.
- Relevant `app_config` documents.
- Existing evaluation config, migration, shadow, and V2 documents if present.

Each backup record includes:

- Full source path.
- Document ID.
- Firestore update time.
- A type-preserving representation of every value.
- Canonical SHA-256.

The typed backup encoding distinguishes Firestore timestamps, references, bytes, geographic points, integers, doubles, arrays, maps, nulls, and strings. It does not use `default=str`.

The source snapshot hash is calculated over sorted full paths and their canonical typed values.

### Dry-run sequence

Dry-run performs these steps with zero Firestore writes:

1. Read and hash the complete source snapshot.
2. Parse and validate the Lisbon config.
3. Build the preserved set.
4. Reproduce the current Lisbon display model.
5. Determine each source document’s effective page slot.
6. Build the candidate scoring set.
7. Detect stale pages, missing pages, invalid values, unknown fields, duplicate assignments, duplicate effective score keys, duplicate bonus keys, missing participants/juries, and embedded bonus anomalies.
8. Build proposed raw shadows and V2 projections in memory.
9. Run preserved-set verification.
10. Run scoring-set verification.
11. Run the legacy parity and additive-bonus delta report.
12. Emit typed backup, canonical JSON, CSV, and local manifest.
13. Exit nonzero when any blocker exists.

The tool must not ask for confirmation. Automation determines whether a subsequent explicit `--apply` invocation is allowed.

### Apply sequence

Apply requires a matching dry-run artifact. A blocker-free artifact needs no adjudication. If and only if its remaining blockers are `duplicate-effective-score-key` or `duplicate-bonus-key`, apply also requires a complete valid `EvaluationMigrationAdjudicationArtifactV2` whose SHA-256 is included in the apply request. Every non-adjudicable blocker must be absent, and every preserved-set, scoring-set, config, input, legacy-base-parity, bonus-delta, and source-stability gate must pass before the first write, regardless of adjudication. In particular, `parity-failure` is never adjudicable.

1. Re-read all source update times and hashes.
2. Abort if any source changed since the dry-run.
3. Create raw legacy shadows in batches.
4. Create scoring-set V2 projections in batches.
5. Create V2 jury-input projections in batches.
6. Atomically write the Lisbon evaluation config and stamp the event descriptor, using the event update-time precondition.
7. Write the migration manifest as `applied`.
8. Re-read every original, shadow, V2 projection, config, and descriptor.
9. Run all verification again against actual stored values.
10. Update the manifest to `verified` only if every gate passes.

Writes are create-only where possible:

- An absent target is created.
- A byte-equivalent existing target is idempotent success.
- A conflicting existing target is failure.
- Re-running a verified migration performs zero data writes and produces the same canonical report hash, excluding execution timestamps.

The migration runs during a Lisbon score-write maintenance window. This avoids an unauthenticated dual-write scheme and allows update-time preconditions to prove the snapshot stayed stable.

### Hard deploy-ordering gate

The Phase 1a client fails closed when the selected event has no evaluation descriptor. The current checked-in Lisbon seed writes no descriptor (`scripts/seed-firestore-emulator.mjs:75-85`), and live `lisbon-2025` has none before this migration. Therefore the Phase 1a client must not be deployed until the offline migration has stamped `events/lisbon-2025.evaluation`, written the config at its `configPath`, reached `verified`, and a release check has re-read and validated both live documents.

The only permitted alternative is to ship the descriptor requirement behind a feature flag that remains disabled for Lisbon until the same migration and verification complete. The bundled fallback cannot bridge this ordering gap because it also requires a valid descriptor. Client deployment is blocked if neither condition is satisfied.

### Preserved-set verification

Preserved verification is independent from scoring.

For every original legacy score and bonus document:

- The original path still exists.
- Its typed value and SHA-256 are unchanged.
- Its raw shadow exists.
- The shadow’s stored source path and source hash match.
- The shadow’s raw typed value round-trips to the source exactly.
- Unknown and ninth fields remain present.
- Timestamps retain their Firestore types.
- No source document was deleted or rewritten.

The preserved-set count must equal the number of source score and bonus documents, regardless of whether a source participates in scoring.

### Scoring-set verification

For every scoring-set source:

- `pageNumber` maps to the expected assigned slot.
- The V2 logical key uses that effective slot.
- Stored legacy `questionNumber` is retained only as provenance.
- Category, config version, fingerprint, and assignment hash match.
- Each of the eight legacy fields maps to the intended V2 section/input.
- The V2 value is numerically identical to the legacy value.
- No stale or unassigned source contributes to the V2 base.
- No two unresolved sources share a logical V2 key.
- Every V2 source reference resolves to a preserved shadow.

For stale, malformed, or unassigned documents:

- The source and shadow are present in the preserved set.
- No V2 scoring document is produced from that source.
- The report explains whether the legacy displayed path ignored it, used the `questionNumber` fallback, or counted its jury ID.

Round-trip assertions apply to the preserved set. Score parity assertions apply to the scoring set plus the specified Lisbon missing-question synthesis. These are not conflated.

### Offline Lisbon parity and delta report

The audit tool loads both representations using one-shot Admin SDK reads. The live app does not compare them.

For each participant, the report records:

- Ranking eligibility, sentinel reason, category, and assigned questions.
- Every source score and bonus path and hash.
- The score-derived jury set.
- Stale, malformed, duplicate, and excluded sources.
- Complete/incomplete averaging branch.
- Pre-round and post-round averaged fields.
- Void decisions.
- Per-input raw impact.
- Section raw and capped impacts.
- Per-question score.
- `oldDisplayedBase`.
- `v2LegacyCompatibleBase`.
- `canonicalJuryFirstBaseDiagnostic`.
- Raw and applied bonus.
- Old and new final.
- Rank movement.

The required calculations are:

```text
bonusJuryIds =
  distinct jury IDs derived from legacy score documents

rankingEligible =
  participant.isDone
  and bonusJuryIds.length > 0

bonusApplied =
  mean(overallBonuses?.[juryId] ?? 0
       for juryId in bonusJuryIds)

newDisplayedDiagnostic =
  round2(clamp(v2LegacyCompatibleBase + bonusApplied, 0, 105))

bonusDeltaDiagnostic =
  round2(newDisplayedDiagnostic - oldDisplayedBase)

if rankingEligible:
  oldFinal = oldDisplayedBase
  newFinal = newDisplayedDiagnostic
else:
  oldFinal = -1
  newFinal = -1
  oldRank = none
  newRank = none

aggregationDiagnostic =
  round2(canonicalJuryFirstBaseDiagnostic - oldDisplayedBase)
```

Required gates:

```text
oldDisplayedBase === v2LegacyCompatibleBase
every legacy/V2 void decision matches
every scoring-set raw input matches
every section impact matches
every question score matches
all preserved sources round-trip
for every eligible participant, newFinal - oldFinal is explained only by bonusApplied
every ineligible participant retains finalScore = -1 and has no rank
```

Any base delta blocks activation. Diagnostic base and bonus calculations may be retained for an ineligible participant, but they are not displayed and do not enter ranking. The jury-first diagnostic is informational for Lisbon.

Participant ranks are calculated twice over eligible participants only, with participant ID as the stable tie-breaker. The report lists old rank, new rank, and movement; ineligible participants have no rank.

The participant CSV includes:

```text
participantId,name,category,assignedQuestions,
rankingEligible,eligibilityReason,
sourceScorePaths,sourceBonusPaths,sourceHashes,
juryIds,questionCount,preservedCount,scoringCount,
staleCount,missingCount,duplicateCount,invalidCount,
averagingBranch,voidCount,sectionResults,
oldDisplayedBase,v2CompatibleBase,canonicalJuryFirstDiagnostic,
rawBonuses,bonusApplied,
oldFinal,newFinal,bonusDeltaDiagnostic,
oldRank,newRank,rankMovement,
schemaVersion,configVersion,scoringFingerprint,
algorithmVersion,migrationId,snapshotHash
```

The JSON summary includes document counts, canonical byte sizes, anomaly counts, blocker counts, changed participant count, delta min/mean/max, rank-change count, config/report hashes, and all verification failures.

For the unchanged repository fixture, `participant-active` is `isDone: false` (`scripts/seed-firestore-emulator.mjs:116-130`). Its score math is diagnostic only:

```text
Q1 = 100 - 2(self correction) - 1(tajweed minor) = 97
Q2 missing under Lisbon policy = 100
diagnostic legacy base = (97 + 100) / 2 = 98.5
bonus jury set = [jury-one]
bonus = 2
diagnostic additive result = 100.5
diagnostic delta = +2
displayed finalScore = -1
displayed rank = none
```

## 4. Blast radius

| Area | Phase 1a change | Risk |
|---|---|---:|
| `src/models/models.ts` and new evaluation model modules | Retain legacy types; add config, V2 raw-input, provenance, result, and manifest contracts | Critical |
| New Lisbon config module | One typed source for bundled fallback, offline seed, migration, and tests | Critical |
| `src/contexts/EventContext.tsx` | Own event descriptor and config loading; clear state on event switch; gate consumers until ready | Critical |
| `src/components/ui/EventSelector.tsx` | Do not create partial unconfigured events; disable/hide in-app creation in Phase 1a | High |
| Config parser/compiler | Boundary validation, hashes, ordered lookups, and no config write API | Critical |
| `src/utils/scoreUtils.ts` | Add configurable V2 scorer and exact `legacy-lisbon-display-v1`; remove duplicated formula ownership | Critical |
| `src/lib/quranUtils.ts` | Accept explicit loaded category slots; remove A fallback for configured events; preserve page exclusion behavior | Critical |
| `src/hooks/useParticipants.ts` | Select one collection representation by event mode; retain Lisbon legacy path; never open both live | Critical |
| `src/hooks/useParticipantScores.ts` | Preserve exact Lisbon float averaging; use V2 inputs for new events | Critical |
| `src/hooks/useJuryScores.tsx` | Keep Lisbon legacy writes; use dynamic V2 values for new events; validate config constraints | Critical |
| `src/hooks/useJuryNavigation.tsx` | Stop writing nested `overall_bonus`; keep bonus in its scoped document | High |
| `src/services/scores.ts` and V2 score service | Canonical effective-slot keys, provenance, assignment hash, and filtered participant/jury queries | Critical |
| Assignment/update/reset services | Keep native V2 assignment and score state consistent; fail closed on mismatches | High |
| `ScoreForm`, `ScoreCategory`, `ScoreInput`, `SliderInput` | Render configured sections, inputs, limits, weights, and warnings | Critical |
| `QuestionTabs`, jury header, jury route | Use configured question count and block until config readiness | High |
| `ScoreSummary`, `ScoreDetailsDialog` | Consume engine results instead of recalculating fixed caps and penalties | Critical |
| `ParticipantScoreVisualizations` | Render dynamic sections and configured final maxima above 100 | Critical |
| `participants.lazy.tsx`, tables, export | Route by evaluation mode, apply additive Lisbon bonus, and use one canonical result | Critical |
| Participant forms/status filters | Use explicit event category IDs; unknown categories fail closed | High |
| `randomizer.lazy.tsx`, `randomizer-audience.lazy.tsx` | Use explicit page slots and question counts; remove category inference | Critical |
| `big-screen.lazy.tsx` | Remove hardcoded `1 - 20` and display loaded category/range data | High |
| Static category asset maps | Remain legacy presentation data in Phase 1a; missing asset behavior must not change scoring | Medium |
| `scripts/export_participant_scores_csv.py` | Replace obsolete root reads or retire it in favor of the event-aware audit/export path | High |
| New Admin SDK migration/audit tool | Typed backup, dry-run default, preserved shadows, V2 projections, parity report, no deletion | Critical |
| `scripts/seed-firestore-emulator.mjs` | Keep original fixture unchanged; add config and separate anomaly fixtures | Critical |
| Phase 0 E2E | Preserve existing route assertions and add numeric/config/read-topology coverage | Critical |
| Firestore indexes | Add only indexes required by participant/jury filtered V2 queries | Medium |
| Firestore rules/auth | No Phase 1a enforcement work; current production-rule problem remains explicit | Critical |

## 5. Trial plan

### Trial 1: `lisbon-2025`

Use the real event for dry-run and audit. Use the emulator for repeatable apply and UI gates.

#### Unchanged eight-field fixture

The existing document remains byte-for-byte unchanged:

```text
events/lisbon-2025/scores/participant-active_jury-one_1
```

Its nested `scores` map continues to contain exactly:

```text
hifdh_judge_correction
hifdh_self_correction
hifdh_stuck_count
tajweed_major
tajweed_minor
waqf_ibtida_incorrect
waqf_ibtida_meaning
husn_al_ada_score
```

It must not gain nested `overall_bonus`. The existing separate bonus document remains unchanged. Existing Phase 0 tests stay enabled.

Diagnostic-only score math:

```text
Q1 = 97
Q2 missing = 100
legacy base diagnostic = 98.5
bonus = 2
additive diagnostic = 100.5
```

`participant-active` is `isDone: false` in the seed (`scripts/seed-firestore-emulator.mjs:116-130`). The ranking path must therefore display no score, retain `finalScore = -1`, and assign no rank despite the diagnostic values above.

#### Completed ranking fixture

Add a separate Lisbon seed participant so the unchanged eight-field fixture remains byte-for-byte intact:

```text
participantId = participant-ranking-done
category = A1
isDone = true
assignedQuestions = [42, 87]

score document = participant-ranking-done_jury-one_1
juryId = jury-one
questionNumber = 1
pageNumber = 42
scores = the same eight values as the unchanged fixture

bonus document = participant-ranking-done_jury-one
juryId = jury-one
overallBonus = 2
```

This participant has one score-derived jury and is ranking-eligible. Its expected displayed result is:

```text
Q1 = 97
Q2 missing = 100
legacy base = 98.5
bonus = 2
displayed final = 100.5
```

The emulator-backed ranking smoke test selects A1 with final-score descending order and asserts that `participant-ranking-done` is the first eligible row (rank 1), displays `100.50 pts`, and has enabled score details. It also asserts that unfinished `participant-active` remains unranked with no displayed score.

#### Fractional judge-correction parity fixtures

Complete fixture:

```text
Category A1, expected questions = 2

Jury 1:
  Q1 judge correction = 2
  Q2 all zero

Jury 2:
  Q1 judge correction = 3
  Q2 all zero

initial Q1 field average = 2.5
existingQuestionCount = 2
complete branch keeps 2.5
2.5 < 3, so Q1 is not void
Q1 = 100 - (2.5 × 3) = 92.5
Q2 = 100
legacy base = 96.25
```

Incomplete fixture:

```text
Same Q1 values, but no stored Q2 for either jury

existingQuestionCount = 1
incomplete branch fills Q2 for each jury
Q1 judge average = Math.round((2 + 3) / 2) = 3
3 >= 3, so Q1 is void
Q1 = 0
Q2 = 100
legacy base = 50
```

The offline audit and application compatibility scorer must produce these exact results.

#### Additional Lisbon fixtures

Use separate participants/documents so the original fixture remains unchanged.

1. Void threshold:

```text
hifdh_judge_correction = 3
question score = 0
```

2. Section cap:

```text
tajweed_major = 10
tajweed_minor = 10
raw tajweed impact = 30
applied tajweed impact = 30
```

3. Multi-jury nonlinear aggregation:

```text
Jury 1 judge correction = 2 => independently 94
Jury 2 judge correction = 4 => independently 0
jury-first diagnostic = 47

legacy raw-field average = 3
legacy displayed question = 0
```

4. Stale page:

```text
source page is absent from assignedQuestions
source is preserved and shadowed
source is excluded from the scoring set
its jury remains in the legacy score-derived jury set
the missing expected slot follows the legacy perfect-score rule
```

5. Duplicate effective index:

```text
two legacy source documents for one participant/jury
both pageNumber values remap to the same assigned slot
dry-run reports every source path
apply and activation are blocked without a valid collision adjudication
```

6. Embedded ninth field:

```text
legacy nested score map contains overall_bonus
the raw shadow preserves it
the scoring projection ignores it
the separate overallBonuses document remains authoritative
```

7. Bonus jury set:

```text
jury-score-without-bonus contributes 0
jury-with-bonus-but-no-score is excluded
stale-score jury remains included because current code registers it from scores
```

8. Invalid input:

```text
negative, NaN, infinite, out-of-range, or off-step values
are preserved and reported
produce no V2 score
block activation
never add points
```

#### Lisbon page-range assertions

For every leaf category:

- Explicit slots reproduce the current partition boundaries.
- Deterministic RNG injection produces the same page for each slot.
- Exclusions produce the same remaining-page choice.
- Exhausted partitions preserve the existing reuse behavior.
- X remains pages `3–53`.
- D1 and D2 retain identical ranges.
- Unknown categories block scoring and randomization.

#### Lisbon migration assertions

- Dry-run performs zero writes.
- Apply contains no delete operations.
- Every original score and bonus hash remains unchanged.
- Every original has an exact raw shadow.
- Stale sources are preserved but absent from the scoring set.
- Duplicate keys block apply or activation unless a valid typed collision adjudication selects one source.
- Adjudication cannot clear any non-collision blocker or any parity gate.
- V2 keys use remapped effective slots.
- All source references are retained.
- A rerun performs zero writes.
- A rerun produces the same canonical set/report hashes.
- No Lisbon live route subscribes to V2 or shadow collections.
- Any non-bonus displayed delta blocks activation.
- Lisbon’s descriptor and config are verified before the Phase 1a client deploy gate opens, or the descriptor requirement remains feature-flagged off.

### Trial 2: `trial-weighted-2026`

This event uses native V2 storage and `jury-first-v2`.

Configuration:

- Category `S`.
- Two questions with explicit page slots inside `42–53`.
- Subtractive accuracy section:
  - `x`, weight `4`.
  - `y`, weight `1.5`.
  - Deduction cap `10`.
- Additive delivery section:
  - `z`, weight `2`.
  - Addition cap `4`.
- Override: `x >= 3` → `voidQuestion`.
- Additive participant bonus capped at `3`.
- Missing-question policy: `incompleteEvaluation`.

Fixture:

```text
Jury 1:
  Q1: x=2, y=2, z=2
      subtract raw=8+3=11
      subtract applied=clamp(11,0,10)=10
      add raw=4
      add applied=clamp(4,0,4)=4
      score=100-10+4=94

  Q2: x=0, y=4, z=0
      subtract=6
      add=0
      score=94

  base=(94+94)/2=94
  bonus=3
  final=97

Jury 2:
  Q1: x=3
      voidQuestion => 0

  Q2: all zero
      score=100

  base=(0+100)/2=50
  bonus=1
  final=51

Participant final=(97+51)/2=74
```

This proves decimal weights, impact clamping, a subtractive section, an additive section, a terminal void, additive participant adjustment, and jury-first aggregation.

Negative test:

```text
x = -1
```

The stored input fails validation. It must not produce `rawImpact = -4` or add four points.

### Trial 3: `trial-shapes-2026`

This event also uses native V2 storage.

Configuration:

- Category `ONE` with one question.
- Category `FOUR` with four questions.
- Subtractive section with three inputs weighted `0.25`, `2`, and `5`, cap `6`.
- Additive section weighted `0.5`, cap `2.5`.
- Additive overall bonus.
- Participant/jury subtractive adjustment.
- Rules exercising all override actions.

Numeric fixture:

```text
subtract raw=4×0.25 + 1×2 + 1×5 = 8
subtract applied=clamp(8,0,6)=6

add raw=3×0.5=1.5
add applied=clamp(1.5,0,2.5)=1.5

question score=100-6+1.5=95.5
overall bonus=2
participant-level subtraction=1
jury final=96.5
```

Expected result: `96.5`.

#### Override action fixtures

1. `setSectionImpact` only:

```text
normal subtract impact = 6
matching rule sets subtract impact = 2
final section impact = 2
question score uses -2
```

2. `setQuestionScore` only:

```text
matching rule sets score = 75
result score = 75
all reported section impacts = 0
```

3. `voidQuestion` only:

```text
matching rule voids question
result score = 0
all reported section impacts = 0
```

4. Section override followed by a terminal rule:

```text
priority 10 sets section impact
priority 20 sets question score
terminal score wins
all section impacts = 0
```

5. Terminal rule before a section override:

```text
priority 10 voids question
evaluation returns immediately
later section rule is not evaluated
```

6. Multiple terminal matches:

```text
both conditions match
the lower numeric priority wins
```

7. Multiple section overrides for one section:

```text
both conditions match
the lower numeric priority supplies the impact
the later matching section override is ignored
```

8. Priority tie:

```text
two rules share one priority
config parsing fails
no scorer is created
```

Two independent conforming implementations must return the same serialized results for all eight cases.

### Exact smoke gates

Add a pure config/scoring test target and emulator-backed Playwright coverage.

1. The config parser accepts Lisbon and both synthetic configs.
2. It rejects duplicate IDs and order values, priority ties, input-count mismatches, `questionCount < 1`, invalid page ranges, missing slots, unknown references, negative caps, nonpositive scored weights, nonpositive steps, input `min > max`, inverted question/final bounds, a base score outside question bounds, and non-finite condition values or action impacts/scores.
3. Stored-value parsing rejects missing, extra, negative, non-finite, out-of-range, and off-step inputs.
4. Every impact is clamped to `[0, cap]`.
5. All override actions and combinations above match exactly.
6. Both Lisbon averaging branches produce `96.25` and `50`.
7. The existing eight-field fixture remains unchanged and passing.
8. The unfinished fixture retains displayed `finalScore = -1`; its `98.5` base and `100.5` additive result are diagnostic only. The new completed fixture displays `100.5` and is exercised as rank 1 in the A1 ranking smoke test.
9. The multi-jury nonlinear fixture produces legacy `0` and jury-first diagnostic `47`.
10. Stale documents are present in preserved shadows and absent from the scoring set.
11. Duplicate effective score and bonus keys block cutover.
12. The embedded ninth field round-trips without entering the V2 scoring values.
13. Bonus jury IDs come only from score documents.
14. Explicit page slots reproduce all fourteen legacy ranges.
15. Event metadata and config are provisioned atomically.
16. A missing or unreadable Lisbon `configPath` document falls back only for the explicit allowlisted valid descriptor; no other failure triggers fallback.
17. Missing or invalid V2 config fails closed.
18. Unknown category never becomes A.
19. Lisbon opens only legacy score and bonus listeners.
20. V2 events open only V2 score and jury-input listeners.
21. No live comparison listener exists.
22. Config payload is at most 64 KiB; native V2 score/input documents meet their size budgets.
23. Jury routes use participant/jury-filtered queries.
24. V2 score and jury-input documents contain schema version, config version, fingerprint, algorithm, category ID, and assignment hash.
25. Assignment mismatch prevents a native V2 total.
26. Final scores above 100 render consistently in jury preview, details, ranking, visualization, and export.
27. Dry-run performs zero writes.
28. Apply never deletes or rewrites a legacy source.
29. Adjudication resolves only duplicate effective score or bonus keys; every non-adjudicable blocker and every parity gate still blocks all writes.
30. Apply is idempotent.
31. Preserved-set and scoring-set hashes verify independently.
32. The existing route tests remain enabled and unchanged in strength.
33. The release gate prevents Phase 1a client deployment until Lisbon’s descriptor and config are live and verified, unless the descriptor requirement remains disabled behind a feature flag.
34. Run `npm run tsc`, `npm run lint`, `npm run build`, the pure scoring suite, and `npm run test:e2e:emulator`.

## 6. Phase 1b deferred: requires real authentication

Phase 1b begins only after one of these security models exists:

- Firebase Authentication with custom claims and tested production Firestore rules; or
- A trusted backend that performs config and scoring administration, with clients denied equivalent direct writes.

Phase 1b will design:

- The in-app evaluation config editor.
- Authenticated publisher identity.
- Enforced config freeze after score-bearing data exists.
- Immutable version archives.
- Atomic config publication.
- Rule-backed assignment and score provenance enforcement.
- Audited rollback capable of removing the additive bonus.

Phase 1a does not depend on those mechanisms. It has no in-app config writer and makes no enforceable immutability claim.

## 7. Open questions and residual risks

1. **Production access:** The checked-in production rules currently deny client traffic. Admin SDK migration can run, but the actual deployed rules and the production app’s read/write availability must be verified before rollout.
2. **Direct tampering:** Without trusted auth, a direct client could modify config or score data if deployed rules are permissive. Hash checks detect accidental inconsistency but are not an authorization boundary.
3. **Real Lisbon anomalies:** The first production dry-run may find invalid values, missing pages, duplicate assignments, duplicate effective score keys, or duplicate bonus keys. Only duplicate effective score and bonus keys may use typed human adjudication. Every other blocker requires source or config correction and a new dry-run; migration must not guess.
4. **Lisbon aggregation:** Lisbon remains on `legacy-lisbon-display-v1`. Moving it to jury-first aggregation requires separate approval and another rank/delta report.
5. **Missing questions:** Lisbon preserves missing-question-as-perfect behavior. New events fail incomplete evaluations. Any other policy is a future scoring change.
6. **Maintenance window:** Lisbon apply requires a write pause. The owner, duration, and verification procedure must be agreed before production execution.
7. **Scores above 100:** Lisbon may now reach 105. Copy, tables, progress bars, visualizations, and exports must display configured points rather than assume a percentage capped at 100.
8. **Event provisioning ownership:** Phase 1a creates configured events offline. The operating owner, credential handling, config review process, and backup location must be assigned.
9. **Audit retention:** Backups and reports contain participant and jury data. Storage, access, retention, and deletion policy remain operational decisions. These artifacts must not be committed.
10. **Payload measurement:** The documented formulas and per-document limits are hard gates. The real Lisbon dry-run must record actual document counts and canonical payload bytes before activation.
11. **Assets and localization:** Category image editing and localization policy are outside Phase 1a. Existing assets may remain bundled, but absent assets must not cause category substitution or affect scoring.
12. **Native V2 assignment enforcement:** Phase 1a detects assignment/provenance mismatches and keeps normal UI flows consistent. Only Phase 1b can prevent unauthorized direct assignment changes.
