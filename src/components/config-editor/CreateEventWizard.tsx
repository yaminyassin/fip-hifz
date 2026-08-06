import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/shadcn/button";
import { createEvent } from "@/services/eventProvisioning";
import { NOTIFY_KEYS, notifyError, notifySuccess } from "@/lib/notify";
import { useConfigEditor } from "./useConfigEditor";
import { CategoriesSection, QuestionTypesSection, ScoringSection } from "./sections";
import { AdjustmentsSection, OverrideRulesSection } from "./rulesSections";
import { TextField } from "./fields";

type Step = "identity" | "scoring" | "questionTypes" | "categories" | "rules" | "adjustments";

const STEPS: Step[] = [
  "identity",
  "scoring",
  "questionTypes",
  "categories",
  "rules",
  "adjustments",
];

/**
 * Creates a new event AND its evaluation config in one atomic commit.
 *
 * This replaces EventSelector's old create path, which wrote only the event
 * document and its password. That produced an event with no evaluation
 * descriptor — permanently fail-closed, with no way to repair it from inside
 * the app. There is deliberately no "create now, configure later": an event
 * without a config is not a usable event.
 */
export function CreateEventWizard({
  onCreated,
  onCancel,
}: {
  onCreated: (eventId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("identity");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const eventId = slugifyEventId(name);
  const editor = useConfigEditor(undefined, `${eventId || "event"}-v1`);
  const { draft, dispatch, errors, isDeriving } = editor;

  const identityComplete =
    eventId.length > 0 && name.trim().length > 0 && password.length > 0;
  const canCreate = identityComplete && editor.canPublish && !isCreating;

  async function handleCreate() {
    if (!canCreate) return;
    setIsCreating(true);
    try {
      await createEvent({
        eventId,
        name: name.trim(),
        description: description.trim(),
        eventPassword: password,
        draft: { ...draft, configVersion: `${eventId}-v1` },
      });
      notifySuccess({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.create.success", { name: name.trim() }),
      });
      onCreated(eventId);
    } catch (error) {
      notifyError({
        key: NOTIFY_KEYS.configPublish,
        title: t("configEditor.create.failed"),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="create-event-wizard">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("configEditor.create.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("configEditor.create.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("configEditor.create.cancel")}
          </Button>
          <Button
            size="sm"
            data-testid="create-event-submit"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
          >
            {isCreating
              ? t("configEditor.create.creating")
              : t("configEditor.create.action")}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((candidate) => (
          <Button
            key={candidate}
            size="sm"
            variant={step === candidate ? "default" : "outline"}
            data-testid={`create-step-${candidate}`}
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
        <p className="text-xs text-muted-foreground">{t("configEditor.checking")}</p>
      ) : (
        <p className="text-xs text-emerald-600" data-testid="config-valid">
          {t("configEditor.valid")}
        </p>
      )}

      {step === "identity" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("configEditor.create.name")}
            value={name}
            testId="create-event-name"
            onChange={setName}
            hint={
              eventId
                ? t("configEditor.create.idPreview", { id: eventId })
                : t("configEditor.create.nameHint")
            }
          />
          <TextField
            label={t("configEditor.create.password")}
            value={password}
            testId="create-event-password"
            onChange={setPassword}
            hint={t("configEditor.create.passwordHint")}
          />
          <TextField
            label={t("configEditor.create.descriptionField")}
            value={description}
            testId="create-event-description"
            onChange={setDescription}
          />
        </div>
      ) : null}

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
    </div>
  );
}

/**
 * Firestore document ids may not contain "/" and must be non-empty; the app
 * also uses the id in URLs. Mirrors the shape of the existing live event ids
 * (e.g. "ahlul-quran-international-competition---mozambique").
 */
export function slugifyEventId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
