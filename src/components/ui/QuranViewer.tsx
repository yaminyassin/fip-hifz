import { useQuranPage } from "@/hooks/useQuranPage";
import { useRef, useState, useEffect } from "react";
import { Label } from "../shadcn/label";

type QuranViewerProps = {
  pageNumber?: number;
};

export function QuranViewer({ pageNumber }: QuranViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageWidth, setImageWidth] = useState<number>(800);
  const [imageHeight, setImageHeight] = useState<number>(1000);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        Loading page data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Error loading page data
      </div>
    );
  }

  if (!pageData?.page) {
    return (
      <div className="flex items-center justify-center h-full">
        No page data available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center bg-slate-300 border-2 border-slate-800 p-1"
    >
      <Label className="pb-2"> Question {pageNumber} </Label>
      <div className="border-2 border-slate-800">
        <img
          src={`data:image/png;base64,${pageData.page}`}
          alt={`Quran page ${pageNumber}`}
          onLoad={handleContainerResize}
          style={{
            maxWidth: imageWidth,
            maxHeight: imageHeight,
            width: "auto",
            height: "800px",
          }}
          className="object-contain "
        />
      </div>
    </div>
  );
}
