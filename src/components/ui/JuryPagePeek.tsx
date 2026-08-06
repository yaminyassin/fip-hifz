import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, X } from "lucide-react";

import { useQuranPage } from "@/hooks/useQuranPage";
import type { Participant } from "@/models/models";

/**
 * The mushaf palette. These live here rather than in the Tailwind theme
 * because they belong to this one surface: a printed Qur'an page laid on the
 * judging table. `gild` is a hairline rule only — the jadwal (the ruled frame
 * around a printed mushaf's text block) — never a fill.
 */
const BARK = "#14342A"; // panel surround and button base
const GILD = "#C6A15B"; // jadwal hairline
const PAPER = "#F6EFE0"; // page-tone text and icons on the dark surround

interface JuryPagePeekProps {
  participant: Participant | null;
  /** 1-based question number the jury is scoring right now. */
  selectedQuestion: number;
  /** 1-based question number the reciter is on, or null. */
  activeQuestionNumber: number | null;
}

/**
 * A floating toggle at the bottom-right of the jury route that lifts the
 * mushaf page for the question being scored into view, and puts it back.
 *
 * The page shown follows `selectedQuestion`, not the participant's
 * `activeQuestion` — a juror who tabs back to question 2 to revise a score
 * needs page 2 in front of them, and the rail says so when the reciter has
 * moved on.
 *
 * Deliberately NOT a modal: there is no scrim and an outside click does not
 * close it. The jury keeps scoring with the page open, and only the button or
 * Escape puts it away. The panel also stays mounted while closed so the image
 * is already cached the first time it is opened mid-recitation.
 */
export function JuryPagePeek({
  participant,
  selectedQuestion,
  activeQuestionNumber,
}: JuryPagePeekProps) {
  const { t } = useTranslation();
  const panelId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // `assignedQuestions` is written one page at a time by the randomizer, so a
  // question can legitimately exist with no page behind it yet.
  const pageNumber = participant?.assignedQuestions?.[selectedQuestion - 1];
  const { url } = useQuranPage(pageNumber);

  const isViewingActiveQuestion =
    activeQuestionNumber !== null && selectedQuestion === activeQuestionNumber;

  useEffect(() => {
    setHasImageError(false);
  }, [url]);

  const close = useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Escape closes from anywhere on the route — the jury's hands are on the
  // score inputs, not on this button.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  if (!participant) return null;

  const label = isOpen ? t("jury.pagePeek.close") : t("jury.pagePeek.open");

  return createPortal(
    <>
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-label={t("jury.pagePeek.title")}
        tabIndex={-1}
        className={[
          "fixed bottom-[5.75rem] right-5 z-[101]",
          "flex flex-col overflow-hidden rounded-xl outline-none",
          // Sized to a mushaf page rather than to a generic dialog: the height
          // cap and this width keep a 529x798 page filling the panel edge to
          // edge on a normal laptop, so the panel occludes the score form by
          // as little as the page allows.
          "h-[min(calc(100vh-9.5rem),46rem)]",
          "w-[min(30rem,calc(100vw-2.5rem))]",
          "origin-bottom-right transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "motion-reduce:transition-opacity motion-reduce:duration-100",
          isOpen
            ? "visible scale-100 opacity-100"
            : "invisible scale-95 opacity-0 motion-reduce:scale-100",
        ].join(" ")}
        style={{
          backgroundColor: BARK,
          boxShadow: `0 0 0 1px ${GILD}59, 0 24px 60px -12px rgba(4,20,15,0.55)`,
        }}
      >
        {/* Label rail — a utility voice. The calligraphy on the page below is
            the only display type this panel needs. */}
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span
              className="text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ color: GILD }}
            >
              {t("jury.question")} {selectedQuestion}
            </span>
            <span
              className="text-lg font-medium tabular-nums"
              style={{ color: PAPER }}
            >
              {pageNumber
                ? `${t("jury.page")} ${pageNumber}`
                : t("jury.pagePeek.noPageShort")}
            </span>
          </div>

          {isViewingActiveQuestion ? (
            <span
              className="flex shrink-0 items-center gap-2 text-xs"
              style={{ color: PAPER }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: GILD }}
              />
              {t("jury.pagePeek.recitingNow")}
            </span>
          ) : (
            activeQuestionNumber !== null && (
              <span className="shrink-0 text-xs text-white/55">
                {t("jury.pagePeek.reciterOn", {
                  number: activeQuestionNumber,
                })}
              </span>
            )
          )}
        </div>

        {/* No mat and no frame: the mushaf image carries its own paper and its
            own printed jadwal. Anything drawn around it would be a second
            frame around a frame. */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
          {!pageNumber && (
            <p
              className="max-w-xs px-6 text-center text-sm"
              style={{ color: `${PAPER}b3` }}
            >
              {t("jury.pagePeek.noPage")}
            </p>
          )}

          {pageNumber && hasImageError && (
            <p
              className="max-w-xs px-6 text-center text-sm"
              style={{ color: `${PAPER}b3` }}
            >
              {t("jury.pagePeek.loadFailed", { number: pageNumber })}
            </p>
          )}

          {url && !hasImageError && (
            <img
              src={url}
              alt={t("jury.pagePeek.imageAlt", { number: pageNumber })}
              onError={() => setHasImageError(true)}
              className="h-full w-auto max-w-full rounded-sm object-contain"
            />
          )}
        </div>
      </div>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        className={[
          "fixed bottom-5 right-5 z-[102]",
          "flex h-14 w-14 items-center justify-center rounded-full",
          // The gild hairline goes through the shadow utility, not inline: an
          // inline box-shadow would replace the focus ring instead of stacking
          // with it, and the ring would silently never render.
          "shadow-[0_0_0_1px_rgba(198,161,91,0.6),0_10px_30px_-8px_rgba(4,20,15,0.7)]",
          "transition-transform duration-200 hover:-translate-y-0.5",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-transparent",
        ].join(" ")}
        style={
          {
            backgroundColor: BARK,
            color: PAPER,
            "--tw-ring-color": GILD,
          } as CSSProperties
        }
      >
        {/* The two icons occupy the same cell and cross-fade, so the control
            reads as one object changing state rather than two buttons. */}
        <span className="relative block h-6 w-6">
          <BookOpen
            className={[
              "absolute inset-0 h-6 w-6 transition-all duration-200",
              "motion-reduce:transition-none",
              isOpen ? "scale-90 opacity-0" : "scale-100 opacity-100",
            ].join(" ")}
            aria-hidden="true"
          />
          <X
            className={[
              "absolute inset-0 h-6 w-6 transition-all duration-200",
              "motion-reduce:transition-none",
              isOpen ? "scale-100 opacity-100" : "scale-90 opacity-0",
            ].join(" ")}
            aria-hidden="true"
          />
        </span>
      </button>
    </>,
    document.body
  );
}
