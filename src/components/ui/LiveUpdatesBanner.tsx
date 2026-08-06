import { useTranslation } from "react-i18next";
import { useParticipantsListenerError } from "@/hooks/useParticipants";

/**
 * "Live updates disconnected" surface for routes driven by a Firestore
 * listener.
 *
 * This exists as a component rather than a toast because the three audience
 * routes (/big-screen, /quran-page, /randomizer-audience) suppress toasts —
 * the toast viewport is centred at the top of what is, on those routes, a
 * projector in front of the whole hall. A dead listener is terminal, so the
 * screen would otherwise sit frozen on the previous participant looking
 * perfectly healthy.
 *
 * `variant="operator"` is the ordinary in-page alert.
 *
 * `variant="audience"` is a fixed-position corner badge, deliberately NOT a
 * flow element: both projector layouts size themselves to the viewport and
 * clip the overflow (/big-screen sets `height: innerHeight - 48` with
 * `overflow-hidden`, /quran-page hard-codes `calc(100vh - 180px)`), so a
 * banner that occupied layout space would push the bottom of the Quran page
 * off a screen nobody can scroll — the failure surface would damage the
 * display it exists to annotate. It stays large enough to read from the hall
 * and withholds the raw Firestore message, which only the operator needs.
 */
export const LiveUpdatesBanner = ({
  variant = "operator",
}: {
  variant?: "operator" | "audience";
}) => {
  const { t } = useTranslation();
  const listenerError = useParticipantsListenerError();

  if (!listenerError) return null;

  const isAudience = variant === "audience";

  return (
    <div
      role="alert"
      data-testid="live-updates-banner"
      className={
        isAudience
          ? "fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full border-2 border-red-300 bg-red-600 px-6 py-3 text-xl font-bold text-white shadow-lg"
          : "w-full rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
      }
    >
      {isAudience ? (
        <>
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-white"
          />
          {t("participants.listenerErrorAudience")}
        </>
      ) : (
        <>
          {t("participants.listenerError")}
          <span className="ml-2 text-xs opacity-80">({listenerError})</span>
        </>
      )}
    </div>
  );
};
