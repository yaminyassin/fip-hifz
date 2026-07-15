import { useQuranPage } from "@/hooks/useQuranPage";
import { useRef, useEffect, useState } from "react";
import { Label } from "../shadcn/label";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

type QuranViewerProps = {
  pageNumber?: number;
  questionNumber?: number;
  hasAssignedQuestions?: boolean;
};

export function QuranViewer({
  pageNumber,
  questionNumber,
  hasAssignedQuestions = true,
}: QuranViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // Static URL for the page image (no async fetch).
  const { url } = useQuranPage(pageNumber);
  const [hasError, setHasError] = useState(false);

  // Reset the image error whenever the page (URL) changes.
  useEffect(() => {
    setHasError(false);
  }, [url]);

  // Effect to handle initial size and window resize
  useEffect(() => {
    const handleContainerResize = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${containerRef.current.parentElement?.clientHeight || 0}px`;
      }
    };

    handleContainerResize();
    window.addEventListener("resize", handleContainerResize);
    return () => window.removeEventListener("resize", handleContainerResize);
  }, []);

  // Show loading if no active question (pageNumber) is provided or zero
  if (!pageNumber) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader2
          className="h-6 w-6 animate-spin text-primary"
          aria-label={t("common.loading")}
        />
      </div>
    );
  }

  // Wrapper with fixed height to prevent layout shifts
  const contentWrapper = (
    <div
      ref={containerRef}
      className="flex flex-col items-center bg-slate-300 border-2 border-slate-800 p-1 w-full h-full"
    >
      <Label className="pb-2">
        {pageNumber !== undefined // Only display if we have a page number
          ? !hasAssignedQuestions
            ? // Show both Page X and Waiting...
              `${t("randomizer.questionLabel", { number: pageNumber })} | ${t("jury.waitingForQuestions")}`
            : questionNumber
              ? // Show Question X - Page Y
                t("randomizer.questionLabelWithPage", {
                  question: questionNumber,
                  page: pageNumber,
                })
              : // Show Page Y (fallback if assigned but no question number)
                t("randomizer.questionLabel", { number: pageNumber })
          : ""}
      </Label>

      {(!url || hasError) && hasAssignedQuestions && (
        <div className="flex items-center justify-center h-full w-full">
          {t("randomizer.messages.noParticipant")}
        </div>
      )}

      {url && !hasError && (
        <div className="border-2 border-slate-800 flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
          <img
            src={url}
            onError={() => setHasError(true)}
            alt={t("randomizer.questionLabel", { number: pageNumber })}
            className="h-full w-full object-contain"
          />
        </div>
      )}
    </div>
  );

  return contentWrapper;
}
