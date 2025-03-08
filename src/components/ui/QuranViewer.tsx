import { useQuranPage } from "@/hooks/useQuranPage";
import { useRef, useState, useEffect } from "react";
import { Label } from "../shadcn/label";
import { useTranslation } from "react-i18next";

type QuranViewerProps = {
  pageNumber?: number;
  questionNumber?: number;
  hasAssignedQuestions?: boolean;
};

export function QuranViewer({ 
  pageNumber, 
  questionNumber, 
  hasAssignedQuestions = true 
}: QuranViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageWidth, setImageWidth] = useState<number>(800);
  const [_, setImageHeight] = useState<number>(1000);
  const { t } = useTranslation();

  const { data: pageData, isLoading, error } = useQuranPage(pageNumber);

  // Update page dimensions when container size changes
  const handleContainerResize = () => {
    if (containerRef.current) {
      setImageWidth(containerRef.current.clientWidth);
      setImageHeight(containerRef.current.clientHeight);
    }
  };

  // Effect to handle initial size and window resize
  useEffect(() => {
    handleContainerResize();
    window.addEventListener("resize", handleContainerResize);
    return () => window.removeEventListener("resize", handleContainerResize);
  }, []);

  // Wrapper with fixed height to prevent layout shifts
  const contentWrapper = (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center bg-slate-300 border-2 border-slate-800 p-1 h-[800px]"
    >
      <Label className="pb-2">
        {!hasAssignedQuestions ? (
          t("jury.waitingForQuestions")
        ) : questionNumber && pageNumber ? (
          t("randomizer.questionLabelWithPage", { 
            question: questionNumber, 
            page: pageNumber 
          })
        ) : (
          t("randomizer.questionLabel", { number: pageNumber })
        )}
      </Label>

      {isLoading && (
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-center">{t("common.loading")}</div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-full w-full text-red-500">
          {t("common.error")}
        </div>
      )}
      
      {!hasAssignedQuestions && (
        <div className="flex items-center justify-center h-full w-full text-gray-600 text-xl font-medium">
          {t("jury.noQuestionsAssignedYet")}
        </div>
      )}
      
      {!isLoading && !error && !pageData?.page && hasAssignedQuestions && (
        <div className="flex items-center justify-center h-full w-full">
          {t("randomizer.messages.noParticipant")}
        </div>
      )}
      
      {!isLoading && !error && pageData?.page && hasAssignedQuestions && (
        <div className="border-2 border-slate-800 h-full flex items-center justify-center">
          <img
            src={`data:image/png;base64,${pageData.page}`}
            alt={t("randomizer.questionLabel", { number: pageNumber })}
            onLoad={handleContainerResize}
            style={{
              maxWidth: imageWidth,
              width: "auto",
              height: "auto",
              maxHeight: "750px",
            }}
            className="object-contain"
          />
        </div>
      )}
    </div>
  );

  return contentWrapper;
}
