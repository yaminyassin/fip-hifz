import { Timestamp } from "firebase/firestore";

/**
 * Phase 1a evaluation config / scoring types.
 *
 * Source of truth: docs/migrations/phase-1-evaluation-model.md, section 2
 * ("Target model"). Keep this module free of app-level imports (no
 * src/models, no src/hooks) so the pure scoring engine and its tests never
 * depend on React, Firestore listeners, or any other consumer wiring.
 */

export type ConfigVersion = string;
export type ScoringFingerprint = string;
export type CategoryId = string;
export type QuestionTypeId = string;
export type AdjustmentTypeId = string;
export type InputId = string;

export type EvaluationMode = "legacy-lisbon-display-v1" | "jury-first-v2";

export interface EventEvaluationDescriptorV2 {
  schemaVersion: 2;
  mode: EvaluationMode;
  configVersion: ConfigVersion;
  configPath: string;
  contentHash: string;
  scoringFingerprint: ScoringFingerprint;
  provisionedBy: "offline-admin-sdk";
  provisionedAt: Timestamp;
}

export interface EventDocumentV2 {
  name: string;
  description?: string;
  status: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  evaluation: EventEvaluationDescriptorV2;
}

export interface LocalizedText {
  default: string;
  translations?: Readonly<Record<string, string>>;
}

export interface PageRange {
  startPage: number; // inclusive
  endPage: number; // inclusive
}

export interface CategoryQuestionSlot {
  questionNumber: number;
  pageRange: PageRange;
  sourceJuzRange?: {
    start: number;
    end: number;
  };
}

export interface EventCategoryDefinition {
  id: CategoryId;
  groupId?: string; // filtering only
  label: LocalizedText;
  order: number;
  questionCount: number;
  questionSlots: readonly CategoryQuestionSlot[];
  /** URL/path reference to this category's display asset (e.g. an image
   * shown on the randomizer/big-screen). Actual asset STORAGE is a later
   * phase — this field is just the ref; consumers resolve it directly.
   * Optional so existing configs without an asset need no migration. */
  assetRef?: string;
}

export interface InputDefinitionCommon {
  id: InputId;
  label: LocalizedText;
  order: number;
  control: "integerCounter" | "decimalCounter" | "slider";
  min: number;
  max: number;
  step: number;
}

export interface ScoredInputDefinition extends InputDefinitionCommon {
  role: "scored";
  perInputWeight: number;
}

export interface InformationalInputDefinition extends InputDefinitionCommon {
  role: "informational";
}

export type EvaluationInputDefinition =
  | ScoredInputDefinition
  | InformationalInputDefinition;

export interface QuestionTypeCommon {
  id: QuestionTypeId;
  label: LocalizedText;
  order: number;
  inputCount: number;
  inputs: readonly EvaluationInputDefinition[];
}

export type QuestionTypeDefinition =
  | (QuestionTypeCommon & {
      operation: "subtract";
      perSectionDeductionCap: number;
    })
  | (QuestionTypeCommon & {
      operation: "add";
      perSectionAdditionCap: number;
    });

export interface InputReference {
  questionTypeId: QuestionTypeId;
  inputId: InputId;
}

export interface InputCondition {
  input: InputReference;
  operator: "gte" | "gt" | "eq" | "lte" | "lt";
  value: number;
}

export interface RuleCondition {
  kind: "all" | "any";
  conditions: readonly InputCondition[];
}

export type QuestionOverrideAction =
  | { kind: "voidQuestion" }
  | { kind: "setQuestionScore"; score: number }
  | {
      kind: "setSectionImpact";
      questionTypeId: QuestionTypeId;
      impact: number;
    };

export interface QuestionOverrideRule {
  id: string;
  priority: number;
  when: RuleCondition;
  action: QuestionOverrideAction;
}

export interface ParticipantAdjustmentCommon {
  id: AdjustmentTypeId;
  label: LocalizedText;
  order: number;
  scope: "participantJury";
  inputCount: number;
  inputs: readonly EvaluationInputDefinition[];
}

export type ParticipantAdjustmentDefinition =
  | (ParticipantAdjustmentCommon & {
      operation: "subtract";
      deductionCap: number;
    })
  | (ParticipantAdjustmentCommon & {
      operation: "add";
      additionCap: number;
    });

export interface EventEvaluationConfigV2 {
  schemaVersion: 2;
  configVersion: ConfigVersion;
  contentHash: string;
  scoringFingerprint: ScoringFingerprint;
  algorithmVersion: EvaluationMode;

  scoring: {
    baseScorePerQuestion: number;
    questionBounds: { min: number; max: number };
    finalBounds: { min: number; max: number };
    missingQuestionPolicy: "zeroInputsArePerfect" | "incompleteEvaluation";
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

/** Fields hashed into `contentHash`, in canonical field order. Excludes
 * `contentHash` itself and `provisionedAt` (the only operational/timestamp
 * config field under this V2 contract). */
export const CANONICAL_CONFIG_HASH_FIELDS = [
  "schemaVersion",
  "configVersion",
  "scoringFingerprint",
  "algorithmVersion",
  "scoring",
  "categories",
  "questionTypes",
  "overrideRules",
  "participantAdjustments",
] as const satisfies readonly (keyof EventEvaluationConfigV2)[];

// ---------------------------------------------------------------------------
// V2 score identity, provenance, and migration manifest types (section 2:
// "V2 score identity and provenance", "Migration manifest").
// ---------------------------------------------------------------------------

export interface LegacySourceReferenceV2 {
  sourcePath: string;
  sourceDocumentId: string;
  sourceSha256: string;
  shadowPath: string;

  storedQuestionNumber?: number;
  storedPageNumber?: number;
  effectiveQuestionNumber?: number;
}

export interface NativeV2Source {
  kind: "nativeV2";
}

export interface MigratedV2Source {
  kind: "legacyMigration";
  migrationId: string;
  sourceReferences: readonly LegacySourceReferenceV2[];
  adjudication?: {
    blockerCode: "duplicate-effective-score-key" | "duplicate-bonus-key";
    decision: "selectSource";
    selectedSourcePath: string;
    reason: string;
    adjudicationArtifactSha256: string;
  };
}

export interface EvaluationScoreV2 {
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

  values: Readonly<Record<QuestionTypeId, Readonly<Record<InputId, number>>>>;

  source: NativeV2Source | MigratedV2Source;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JuryEvaluationInputsV2 {
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

export type MigrationState = "dryRun" | "blocked" | "applied" | "verified";

export interface MigrationArtifactRefV2 {
  uri: string;
  sha256: string;
  byteLength: number;
}

export interface MigrationSetSummaryV2 {
  sourceCount: number;
  shadowCount: number;
  projectedCount: number;
  canonicalSetSha256: string;
}

export type MigrationBlockerCodeV2 =
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

export interface MigrationBlockerV2 {
  code: MigrationBlockerCodeV2;
  sourcePaths: readonly string[];
  logicalKey?: string;
  detail: string;
}

export type AdjudicableMigrationBlockerCodeV2 =
  | "duplicate-effective-score-key"
  | "duplicate-bonus-key";

export interface MigrationAdjudicationDecisionV2 {
  blockerCode: AdjudicableMigrationBlockerCodeV2;
  logicalKey: string;
  sourcePaths: readonly string[];
  decision: "selectSource";
  selectedSourcePath: string;
  reason: string;
}

export interface EvaluationMigrationAdjudicationArtifactV2 {
  schemaVersion: 2;
  artifactVersion: 1;
  migrationId: string;
  projectId: string;
  eventId: string;
  sourceSnapshotCanonicalSha256: string;
  decisions: readonly MigrationAdjudicationDecisionV2[];
}

export interface EvaluationMigrationManifestV2 {
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
