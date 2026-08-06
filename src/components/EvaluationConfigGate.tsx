import React from "react";
import { useEvent } from "@/contexts/EventContext";
import { useTranslation } from "react-i18next";

/**
 * The render-blocking gate every scored route wraps itself in (design doc
 * §2, "Gating"): children never render while the event's evaluation config
 * is loading or absent, and a `failClosed` status renders an explicit error
 * surface instead of falling through to any hardcoded default config or
 * category. This is what makes the engine's "fail closed" contract visible
 * in the UI, not just true of the loader function in isolation.
 */
export function EvaluationConfigGate({ children }: { children: React.ReactNode }) {
  const { currentEvent, evaluationConfigStatus, evaluationConfigError } = useEvent();
  const { t } = useTranslation();

  if (!currentEvent) {
    return (
      <div
        data-testid="evaluation-config-gate-no-event"
        className="flex items-center justify-center p-8 text-muted-foreground"
      >
        {t("evaluationConfig.noEventSelected", "No event selected.")}
      </div>
    );
  }

  if (evaluationConfigStatus === "idle" || evaluationConfigStatus === "loading") {
    return (
      <div
        data-testid="evaluation-config-gate-loading"
        className="flex items-center justify-center p-8"
        role="status"
        aria-live="polite"
      >
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-muted border-t-primary" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  if (evaluationConfigStatus === "failClosed") {
    return (
      <div
        data-testid="evaluation-config-gate-fail-closed"
        role="alert"
        className="m-4 rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/40 p-6 text-red-800 dark:text-red-200"
      >
        <h2 className="text-lg font-bold mb-2">
          {t(
            "evaluationConfig.failClosedTitle",
            "This event has no valid evaluation config"
          )}
        </h2>
        <p className="text-sm">
          {t(
            "evaluationConfig.failClosedBody",
            'Event "{{eventId}}" cannot be scored, randomized, or exported until it is provisioned with a valid EvaluationConfig. No default config or category is used as a fallback.',
            { eventId: currentEvent }
          )}
        </p>
        {evaluationConfigError && (
          <pre className="mt-3 whitespace-pre-wrap rounded bg-red-100 dark:bg-red-900/40 p-2 text-xs">
            {evaluationConfigError}
          </pre>
        )}
      </div>
    );
  }

  // evaluationConfigStatus === "ready"
  return <>{children}</>;
}
