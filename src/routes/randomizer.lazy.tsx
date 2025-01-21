import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { ParticipantBanner } from "@/components/ui/ParticipantBanner";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useUpdateParticipantQuestions } from "@/hooks/useUpdateParticipantQuestions";
import { Card, CardContent } from "@/components/shadcn/card";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useToast } from "@/components/shadcn/use-toast";
import { useTranslation } from "react-i18next";

const RandomNumber = ({ number, index }: { number: number; index: number }) => {
  const [displayNumber, setDisplayNumber] = useState(number);
  const { t } = useTranslation();

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (number === 0) {
      intervalId = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 600) + 1);
      }, 50);
    } else {
      setDisplayNumber(number);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [number]);

  return (
    <Card className="w-auto h-auto flex flex-col items-center justify-center bg-card/50 shadow-md">
      <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
        <div className="text-4xl font-medium text-muted-foreground">
          {t("randomizer.questionLabel", { number: index })}
        </div>
        <div className="flex items-center justify-center w-32 h-16 border-2 rounded-lg border-primary/20 bg-background/50 shadow-sm">
          <Label className="text-3xl font-bold">
            {displayNumber === 0 ? "" : displayNumber}
          </Label>
        </div>
      </CardContent>
    </Card>
  );
};

const RouteComponent = () => {
  const [random1, setRandom1] = useState(0);
  const [random2, setRandom2] = useState(0);
  const [random3, setRandom3] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const updateQuestions = useUpdateParticipantQuestions();
  const { data: activeParticipant } = useActiveParticipant();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handlePress = () => {
    if (!activeParticipant) {
      toast({
        title: t("randomizer.messages.error"),
        description: t("randomizer.messages.noParticipant"),
        variant: "destructive",
      });
      return;
    }

    if (isGenerating) {
      return;
    }

    setIsGenerating(true);

    // Reset to 0 to trigger rolling animation
    setRandom1(0);
    setRandom2(0);
    setRandom3(0);

    const final1 = Math.floor(Math.random() * 600) + 1;
    const final2 = Math.floor(Math.random() * 600) + 1;
    const final3 = Math.floor(Math.random() * 600) + 1;

    setTimeout(() => setRandom1(final1), 500);
    setTimeout(() => setRandom2(final2), 1000);
    setTimeout(() => {
      setRandom3(final3);

      // Update Firestore after all numbers are set
      updateQuestions.mutate(
        {
          participantId: activeParticipant.id,
          questions: [final1, final2, final3],
        },
        {
          onSuccess: () => {
            toast({
              title: t("randomizer.messages.success"),
              description: t("randomizer.messages.successDesc"),
            });
            setIsGenerating(false);
          },
          onError: () => {
            toast({
              title: t("randomizer.messages.error"),
              description: t("randomizer.messages.errorDesc"),
              variant: "destructive",
            });
            setIsGenerating(false);
          },
        }
      );
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto p-6 flex flex-col justify-center gap-12">
        <ParticipantBanner />

        <Card className="flex-1 flex flex-col items-center justify-center gap-12 bg-card/50 backdrop-blur-sm p-8">
          <div className="flex flex-row gap-x-24">
            <RandomNumber number={random1} index={1} />
            <RandomNumber number={random2} index={2} />
            <RandomNumber number={random3} index={3} />
          </div>

          <Button
            className="w-1/2"
            onClick={handlePress}
            size="lg"
            variant="default"
            disabled={isGenerating || !activeParticipant}
          >
            {isGenerating ? t("randomizer.generating") : t("randomizer.generateQuestions")}
          </Button>
        </Card>
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/randomizer")({
  component: RouteComponent,
});
