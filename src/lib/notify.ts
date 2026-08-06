import { toast } from "@/components/shadcn/use-toast";

/**
 * The app's single notification surface.
 *
 * Before this existed, <Toaster/> was mounted in __root.tsx and never called
 * from anywhere outside src/components/shadcn — every failure went to
 * console.error, so a jury save that failed, a randomizer page that never
 * persisted, and a successful run all looked identical on screen.
 *
 * Three behaviours here are not optional, and each exists because of a
 * specific property of the underlying shadcn toast:
 *
 * 1. KEYED DEDUPE. TOAST_LIMIT is 1 (use-toast.ts:8), so firing N toasts in a
 *    loop leaves only the last one visible. Repeated notifications under one
 *    key therefore UPDATE the existing toast instead of stacking. Anything
 *    that can fail per-item in a loop should aggregate into one message
 *    rather than call this N times.
 *
 * 2. ERRORS DO NOT AUTO-DISMISS. The default lifetime is a few seconds, which
 *    is fine for "saved" and wrong for "your score was not saved" — an
 *    operator who looked away would never know. Errors stay until dismissed.
 *
 * 3. AUDIENCE ROUTES ARE SUPPRESSED. A floating toast has no business on
 *    /big-screen, /quran-page or /randomizer-audience — those are projected in
 *    front of the whole hall, and an operator-facing "reload the page" message
 *    is something a room of spectators can neither act on nor should see.
 *    Those routes surface problems in their own layout instead (see
 *    LiveUpdatesBanner). Suppression is silent by design; the operator screens
 *    still report the same failure.
 */

/** Routes rendered for an audience, where a floating toast is unacceptable. */
const AUDIENCE_ROUTES = ["/big-screen", "/quran-page", "/randomizer-audience"];

function isAudienceRoute(): boolean {
  if (typeof window === "undefined") return false;
  return AUDIENCE_ROUTES.some((route) =>
    window.location.pathname.startsWith(route)
  );
}

type ToastHandle = ReturnType<typeof toast>;

const active = new Map<string, ToastHandle>();

export interface NotifyOptions {
  /** Stable identity for this notification. Repeat calls update in place. */
  key: string;
  title: string;
  description?: string;
}

function show(
  options: NotifyOptions,
  variant: "default" | "destructive" | "warning" | "success",
  persistent: boolean
): void {
  if (isAudienceRoute()) return;

  const existing = active.get(options.key);
  const payload = {
    title: options.title,
    description: options.description,
    variant,
    // Radix reads `duration`; Infinity means "until dismissed".
    duration: persistent ? Infinity : undefined,
  };

  if (existing) {
    existing.update({ id: existing.id, ...payload });
    return;
  }

  const handle = toast(payload);
  active.set(options.key, handle);
}

/**
 * A failure the operator must act on. Stays on screen until dismissed.
 * Use for anything where continuing as if it succeeded produces wrong data.
 */
export function notifyError(options: NotifyOptions): void {
  show(options, "destructive", true);
}

/** Something is off but the operation stands. Auto-dismisses. */
export function notifyWarning(options: NotifyOptions): void {
  show(options, "warning", false);
}

/** Confirmation that a deliberate operator action landed. Auto-dismisses. */
export function notifySuccess(options: NotifyOptions): void {
  show(options, "success", false);
}

/** Clears a keyed notification — call when the underlying problem resolves. */
export function dismissNotification(key: string): void {
  const existing = active.get(key);
  if (!existing) return;
  existing.dismiss();
  active.delete(key);
}

/**
 * Stable keys, so a retry loop updates one toast rather than flickering
 * between several and so tests can assert on a specific failure.
 */
export const NOTIFY_KEYS = {
  juryScoreSave: "jury.score.save",
  juryScoreLoad: "jury.score.load",
  juryFinish: "jury.finish",
  randomizerGenerate: "randomizer.generate",
  participantSave: "participant.save",
  participantDelete: "participant.delete",
  juryManage: "jury.manage",
  configPublish: "config.publish",
  configLoad: "config.load",
  exportParticipants: "export.participants",
  listenerDisconnected: "listener.disconnected",
} as const;
