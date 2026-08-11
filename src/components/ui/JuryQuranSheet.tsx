import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, X } from "lucide-react";

import { Button } from "@/components/shadcn/button";
import { QuranViewer } from "@/components/ui/QuranViewer";
import type { Participant } from "@/models/models";

type JuryQuranSheetProps = {
  participant: Pick<Participant, "activeQuestion" | "assignedQuestions"> | null;
};

const SHEET_ID = "jury-active-quran-page";

export function JuryQuranSheet({ participant }: JuryQuranSheetProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const pageNumber = participant?.activeQuestion || undefined;
  const activeQuestionIndex = pageNumber
    ? participant?.assignedQuestions.indexOf(pageNumber) ?? -1
    : -1;
  const questionNumber =
    activeQuestionIndex >= 0 ? activeQuestionIndex + 1 : undefined;

  useEffect(() => {
    if (!pageNumber) {
      setIsOpen(false);
    }
  }, [pageNumber]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const buttonLabel = !pageNumber
    ? t("jury.quran.unavailable")
    : isOpen
      ? t("jury.quran.close")
      : t("jury.quran.open");

  const pageLabel = questionNumber
    ? t("jury.quran.questionWithPage", {
        question: questionNumber,
        page: pageNumber,
      })
    : t("jury.quran.page", { page: pageNumber });

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 motion-reduce:transition-none ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        id={SHEET_ID}
        aria-hidden={!isOpen}
        aria-label={t("jury.quran.title")}
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col bg-slate-950 text-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none sm:min-w-[28rem] sm:w-[48vw] ${
          isOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-700 px-5 pr-24">
          <h2 className="text-sm font-semibold">{t("jury.quran.title")}</h2>
          <p className="text-sm text-slate-300">{pageLabel}</p>
        </header>

        <div className="min-h-0 flex-1 p-3 pb-20">
          <QuranViewer
            pageNumber={pageNumber}
            questionNumber={questionNumber}
            hasAssignedQuestions={Boolean(participant?.assignedQuestions.length)}
          />
        </div>
      </aside>

      <Button
        type="button"
        size="icon"
        disabled={!pageNumber}
        aria-controls={SHEET_ID}
        aria-expanded={isOpen}
        aria-label={buttonLabel}
        onClick={() => setIsOpen((open) => !open)}
        className={`fixed bottom-5 right-5 z-50 h-16 w-16 rounded-full text-white shadow-2xl transition-[background-color,transform] duration-300 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-white motion-reduce:transform-none motion-reduce:transition-none md:bottom-6 md:right-6 ${
          isOpen
            ? "bg-red-800 hover:bg-red-700"
            : "bg-slate-900 hover:bg-slate-800"
        }`}
      >
        <BookOpen
          aria-hidden="true"
          className={`absolute !size-7 transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
            isOpen
              ? "rotate-90 scale-50 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <X
          aria-hidden="true"
          className={`absolute !size-7 transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
            isOpen
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-50 opacity-0"
          }`}
        />
      </Button>
    </>
  );
}
