import { Card } from "../shadcn/card";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useTranslation } from "react-i18next";
import { Label } from "../shadcn/label";
import { useCallback, useMemo } from "react";

export const ParticipantBanner = () => {
  const { data: activeParticipant, isLoading, error } = useActiveParticipant();
  const { t } = useTranslation();

  const splitName = useCallback((fullName: string) => {
    if (!fullName || !fullName.trim()) {
      return { name1: "", name2: "" };
    }

    const words = fullName.trim().split(" ");
    const numWords = words.length;
    let name1 = "";
    let name2 = "";

    if (numWords === 1) {
      name1 = words[0];
    } else if (numWords > 1) {
      // Ensure name2 gets more words on odd counts
      const midpoint = Math.floor((numWords + (numWords % 2)) / 2);
      name1 = words.slice(0, midpoint).join(" ");
      name2 = words.slice(midpoint).join(" ");
    }

    return { name1, name2 };
  }, []);

  const { name1, name2 } = useMemo(
    () => splitName(activeParticipant?.name ?? " "),
    [activeParticipant?.name, splitName]
  );

  if (isLoading) {
    return (
      <Card className="w-full shadow-lg bg-card/50 backdrop-blur-sm p-4">
        <div className="text-center text-muted-foreground">
          {t("participants.banner.loading")}
        </div>
      </Card>
    );
  }

  if (error || !activeParticipant) {
    return (
      <Card className="w-full shadow-lg bg-card/50 backdrop-blur-sm p-4">
        <div className="text-center text-muted-foreground">
          {t("participants.banner.noParticipant")}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-row items-center justify-between gap-6 md:gap-8 flex-grow bg-[#FFFEFA] p-8">
      <div className="flex flex-row items-center justify-center">
        <Label className="font-cera text-3xl md:text-4xl font-bold text-[#2F3046]">
          {name1}
        </Label>
        {name2 && (
          <>
            <div className="w-2 h-2 " />
            <Label className="font-cera text-3xl md:text-4xl font-light text-[#2F3046]">
              {name2}
            </Label>
          </>
        )}
      </div>

      {activeParticipant.flag && activeParticipant.country && (
        <div className="flex flex-row items-center gap-3">
          <span className="text-2xl md:text-3xl" aria-hidden="true">
            {activeParticipant.flag}
          </span>
          <Label className="font-cera text-lg md:text-xl font-medium text-[#2F3046]">
            {activeParticipant.country}
          </Label>
        </div>
      )}
    </div>
  );
};
