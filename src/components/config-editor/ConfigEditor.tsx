import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/shadcn/button";
import { useEvent } from "@/contexts/EventContext";
import { useParticipants } from "@/hooks/useParticipants";
import { draftFromConfig, emptyDraft } from "@/evaluation/configDraft";
import {
  countEvaluationDocs,
  evaluateEditGuard,
  lockConfig,
  publishRevision,
  type EditGuardVerdict,
} from "@/services/eventProvisioning";
import { NOTIFY_KEYS, notifyError, notifySuccess } from "@/lib/notify";
import { useConfigEditor } from "./useConfigEditor";
import { CategoriesSection, QuestionTypesSection, ScoringSection } from "./sections";
import { AdjustmentsSection, OverrideRulesSection } from "./rulesSections";
import { TextField } from "./fields";

type Step = "scoring" | "questionTypes" | "categories" | "rules" | "adjustments";

const STEPS: Step[] = [
  "scoring",
  "questionTypes",
  "categories",
  "rules",
  "adjustments",
];

/**
 * The organizer's config editor for an EXISTING event.
 *
 * Publishing is guarded in three layers, and all three matter:
 *  - useConfigEditor refuses to publish a draft that does not validate;
 *  - evaluateEditGuard refuses structural changes that would strand
 *    participants, and demands acknowledgement for changes that invalidate
 *    recorded scores;
 *  - publishRevision compare-and-sets on the stored contentHash, so a second
 *    operator's concurrent edit cannot be silently overwritten.
 */
export function ConfigEditor() {
  const { t } = useTranslation();
  const {
    currentEvent,
    evaluationConfig,
    evaluationConfigStatus,
    evaluationConfigError,
    reloadEvaluationConfig,
  } = useEvent();
  const { data: participants } = useParticipants();

  const [step, setStep] = useState<Step>("scoring");
  const [isPublishing, setIsPublishing] = useState(false);
  const [guard, setGuard] = useState<EditGuardVerdict | null>(null);
  const [publishedHash, setPublishedHash] = useState<string | null>(null);

  const editor = useConfigEditor(
    evaluationConfig ? draftFromConfig(evaluationConfig) : undefined,
    evaluationConfig?.configVersion ?? "config-v1"
  );
  const { draft, dispatch, stamped, errors, isDeriving, isDirty, reset } = editor;

  // Adopt the published config once it arrives (it loads asynchronously).
  useEffect(() => {
    if (!evaluationConfig) return;
    if (publishedHash === evaluationConfig.contentHash) return;
    setPublishedHash(evaluationConfig.contentHash);
    reset(draftFromConfig(evaluationConfig));
  }, [evaluationConfig, publishedHash, reset]);

  const categoriesInUse = useMemo(() => {
    const set = new Set<string>();
    for (const participant of participants ?? []) set.add(participant.category);
    return set;
  }, [participants]);

  const categoriesWithAssignments = useMemo(() => {
    const set = new Set<string>();
    for (const participant of participants ?? []) {
      if ((participant.assignedQuestions?.length ?? 0) > 0) {
        set.add(participant.category);
      }
    }
    return set;
  }, [participants]);

  if (!currentEvent) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="config-no-event">
        {t("configEditor.noEvent")}
      </p>
    );
  }

  // A frozen event is not reflected in the loaded config (configLocked lives
  // on the event document, which the config loader does not surface), so the
  // freeze is enforced where it is authoritative: publishRevision reads it in
  // its transaction and firestore.rules rejects the write outright. The
  // operator sees the refusal as a publish error rather than a disabled
  // button, which is honest — the button being enabled is not a promise.

  async function runGuard(): Promise<EditGuardVerdict | null> {
    if (!stamped || !evaluationConfig || !currentEvent) return null;
    const counts = await countEvaluationDocs(currentEvent);
    return evaluateEditGuard({
      published: evaluationConfig,
      candidate: stamped,
      categoriesInUse,
      categoriesWithAssignments,
      evaluationDocumentCount: counts.total,
    });
  }

  async function handlePublishClick() {
    const verdict = await runGuard();
    if (!verdict) return;
    if (verdict.kind === "none") {
      notifySuccess({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.publish.noChanges"),
      });
      return;
    }
    if (verdict.kind === "block") {
      setGuard(verdict);
      notifyError({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.publish.blocked"),
        description: verdict.reason,
      });
      return;
    }
    if (verdict.kind === "requireRescore") {
      // Never publish a score-invalidating change without an explicit,
      // informed confirmation naming how many documents are affected.
      setGuard(verdict);
      return;
    }
    await doPublish();
  }

  async function doPublish() {
    if (!currentEvent || !evaluationConfig) return;
    setIsPublishing(true);
    try {
      const config = await publishRevision(
        currentEvent,
        draft,
        evaluationConfig.contentHash
      );
      setGuard(null);
      setPublishedHash(config.contentHash);
      reset(draftFromConfig(config));
      reloadEvaluationConfig();
      notifySuccess({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.publish.success"),
        description: t("configEditor.publish.successDetail", {
          version: config.configVersion,
        }),
      });
    } catch (error) {
      notifyError({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.publish.failed"),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleFreeze() {
    if (!currentEvent) return;
    try {
      await lockConfig(currentEvent);
      notifySuccess({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.freeze.done"),
      });
      reloadEvaluationConfig();
    } catch (error) {
      notifyError({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.freeze.failed"),
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="config-editor">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("configEditor.title")}</h2>
          <p className="text-xs text-muted-foreground" data-testid="config-status">
            {evaluationConfigStatus === "ready" && evaluationConfig
              ? t("configEditor.statusReady", {
                  version: evaluationConfig.configVersion,
                })
              : evaluationConfigStatus === "failClosed"
                ? t("configEditor.statusFailClosed", {
                    reason: evaluationConfigError ?? "",
                  })
                : t("configEditor.statusLoading")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("configEditor.size", {
              kb: (editor.approximateBytes / 1024).toFixed(1),
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!isDirty || isPublishing}
            onClick={() =>
              reset(
                evaluationConfig
                  ? draftFromConfig(evaluationConfig)
                  : emptyDraft(draft.configVersion)
              )
            }
          >
            {t("configEditor.discard")}
          </Button>
          <Button
            size="sm"
            data-testid="config-save"
            disabled={!editor.canPublish || !isDirty || isPublishing}
            onClick={() => void handlePublishClick()}
          >
            {isPublishing
              ? t("configEditor.publishing")
              : t("configEditor.publish.action")}
          </Button>
        </div>
      </header>

      {!editor.secureContext ? (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
          {t("configEditor.insecureContext")}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STEPS.map((candidate) => (
          <Button
            key={candidate}
            size="sm"
            variant={step === candidate ? "default" : "outline"}
            data-testid={`config-step-${candidate}`}
            onClick={() => setStep(candidate)}
          >
            {t(`configEditor.steps.${candidate}`)}
          </Button>
        ))}
      </div>

      {errors.length > 0 ? (
        <div
          className="rounded-md border border-destructive bg-destructive/10 p-3"
          data-testid="config-validation-errors"
        >
          <p className="mb-1 text-sm font-medium text-destructive">
            {t("configEditor.validationTitle", { count: errors.length })}
          </p>
          <ul className="list-inside list-disc text-xs text-destructive">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : isDeriving ? (
        <p className="text-xs text-muted-foreground" data-testid="config-deriving">
          {t("configEditor.checking")}
        </p>
      ) : (
        <p className="text-xs text-emerald-600" data-testid="config-valid">
          {t("configEditor.valid")}
        </p>
      )}

      {guard && guard.kind === "requireRescore" ? (
        <div
          className="rounded-md border border-amber-500 bg-amber-50 p-3 dark:bg-amber-950"
          data-testid="config-rescore-confirm"
        >
          <p className="text-sm font-medium">{t("configEditor.rescore.title")}</p>
          <p className="mb-2 text-xs">{guard.reason}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              data-testid="config-rescore-accept"
              onClick={() => void doPublish()}
            >
              {t("configEditor.rescore.accept")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGuard(null)}>
              {t("configEditor.rescore.cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {guard && guard.kind === "block" ? (
        <div
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm"
          data-testid="config-blocked"
        >
          {guard.reason}
        </div>
      ) : null}

      <TextField
        label={t("configEditor.configVersion")}
        hint={t("configEditor.configVersionHint")}
        value={draft.configVersion}
        testId="config-version"
        onChange={(value) => dispatch({ type: "setConfigVersion", value })}
      />

      {step === "scoring" ? (
        <ScoringSection draft={draft} dispatch={dispatch} />
      ) : null}
      {step === "questionTypes" ? (
        <QuestionTypesSection draft={draft} dispatch={dispatch} />
      ) : null}
      {step === "categories" ? (
        <CategoriesSection draft={draft} dispatch={dispatch} />
      ) : null}
      {step === "rules" ? (
        <OverrideRulesSection draft={draft} dispatch={dispatch} />
      ) : null}
      {step === "adjustments" ? (
        <AdjustmentsSection draft={draft} dispatch={dispatch} />
      ) : null}

      <footer className="mt-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium">{t("configEditor.freeze.title")}</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          {t("configEditor.freeze.description")}
        </p>
        <Button
          size="sm"
          variant="outline"
          data-testid="config-freeze"
          onClick={() => void handleFreeze()}
        >
          {t("configEditor.freeze.action")}
        </Button>
      </footer>
    </div>
  );
}
