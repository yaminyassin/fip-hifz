import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { ParticipantBanner } from "@/components/ui/ParticipantBanner";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useUpdateParticipantQuestion } from "@/hooks/useUpdateParticipantQuestion";
import { Card, CardContent } from "@/components/shadcn/card";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useToast } from "@/components/shadcn/use-toast";
import { useTranslation } from "react-i18next";
import { getCategoryConfig, generateRandomPage } from "@/lib/quranUtils";
import { Participant } from "@/models/models";

const RandomNumber = ({ 
  number, 
  index, 
  onRandomize,
  isGenerating
}: { 
  number: number; 
  index: number;
  onRandomize: () => void;
  isGenerating: boolean;
}) => {
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
          {t("randomizer.questionLabel", { number: index + 1 })}
        </div>
        <div className="flex items-center justify-center w-32 h-16 border-2 rounded-lg border-primary/20 bg-background/50 shadow-sm">
          <Label className="text-3xl font-bold">
            {displayNumber === 0 ? "" : displayNumber}
          </Label>
        </div>
        <Button
          onClick={onRandomize}
          size="sm"
          variant="outline"
          disabled={isGenerating}
          className="mt-4"
        >
          {isGenerating ? t("randomizer.generating") : t("randomizer.generateQuestion")}
        </Button>
      </CardContent>
    </Card>
  );
};

const RouteComponent = () => {
  const [questionNumbers, setQuestionNumbers] = useState<number[]>([]);
  const [generatingQuestions, setGeneratingQuestions] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const lastActiveParticipantRef = useRef<Participant | null>(null);
  
  const updateQuestion = useUpdateParticipantQuestion();
  const { data: activeParticipant, isLoading: isParticipantLoading } = useActiveParticipant();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  // Keep track of the last active participant to prevent UI flashing
  useEffect(() => {
    if (activeParticipant) {
      lastActiveParticipantRef.current = activeParticipant;
      setIsLoading(false);
    } else if (!isParticipantLoading) {
      // Only clear the ref if we're sure there's no active participant
      if (!isLoading) {
        lastActiveParticipantRef.current = null;
      }
      setIsLoading(false);
    }
  }, [activeParticipant, isParticipantLoading, isLoading]);

  // Get the number of questions based on the participant's category
  const getNumQuestions = (participant: Participant | null) => {
    if (!participant) return 0;
    
    const config = getCategoryConfig(participant.category);
    return config.numQuestions;
  };

  // Initialize question numbers from participant data
  useEffect(() => {
    const participant = activeParticipant || lastActiveParticipantRef.current;
    
    if (participant) {
      const numQuestions = getNumQuestions(participant);
      let questions = [...(participant.assignedQuestions || [])];
      
      // Ensure we have the right number of questions
      while (questions.length < numQuestions) {
        questions.push(0);
      }
      
      // Trim if we have too many questions
      if (questions.length > numQuestions) {
        questions = questions.slice(0, numQuestions);
      }
      
      setQuestionNumbers(questions);
    } else {
      setQuestionNumbers([]);
    }
  }, [activeParticipant]);

  const handleRandomizeQuestion = (index: number) => {
    const participant = activeParticipant || lastActiveParticipantRef.current;
    
    if (!participant) {
      toast({
        title: t("randomizer.messages.error"),
        description: t("randomizer.messages.noParticipant"),
        variant: "destructive",
      });
      return;
    }

    if (generatingQuestions.has(index)) {
      return;
    }

    // Mark this question as generating
    setGeneratingQuestions(prev => new Set([...prev, index]));

    // Reset to 0 to trigger rolling animation
    setQuestionNumbers(prev => {
      const updated = [...prev];
      updated[index] = 0;
      return updated;
    });

    // Generate a random page based on the participant's category and question index
    const randomPage = generateRandomPage(participant.category, index);

    // Update after a delay to show animation
    setTimeout(() => {
      // Update local state first to ensure UI consistency
      setQuestionNumbers(prev => {
        const updated = [...prev];
        updated[index] = randomPage;
        return updated;
      });

      // Update Firestore
      updateQuestion.mutate(
        {
          participantId: participant.id,
          questionIndex: index,
          pageNumber: randomPage,
        },
        {
          onSuccess: () => {
            toast({
              title: t("randomizer.messages.success"),
              description: t("randomizer.messages.successDesc"),
            });
            setGeneratingQuestions(prev => {
              const updated = new Set([...prev]);
              updated.delete(index);
              return updated;
            });
          },
          onError: (error) => {
            console.error("Error updating question:", error);
            toast({
              title: t("randomizer.messages.error"),
              description: t("randomizer.messages.errorDesc"),
              variant: "destructive",
            });
            setGeneratingQuestions(prev => {
              const updated = new Set([...prev]);
              updated.delete(index);
              return updated;
            });
          },
        }
      );
    }, 1000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted">
        <div className="container mx-auto p-6 flex flex-col justify-center gap-12">
          <ParticipantBanner />
          <Card className="flex-1 flex flex-col items-center justify-center gap-12 bg-card/50 backdrop-blur-sm p-8">
            <div className="text-xl text-center text-muted-foreground">
              {t("common.loading")}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Use the active participant or the last known active participant
  const participant = activeParticipant || lastActiveParticipantRef.current;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto p-6 flex flex-col justify-center gap-12">
        <ParticipantBanner />

        <Card className="flex-1 flex flex-col items-center justify-center gap-12 bg-card/50 backdrop-blur-sm p-8">
          {participant ? (
            <>
              <div className="flex flex-col items-center gap-2">
                <div className="text-2xl font-medium text-center">
                  {t("randomizer.categoryLabel")}: {participant.category}
                </div>
              </div>
              
              <div className="flex justify-center w-full">
                <div className={`grid gap-6 ${
                  questionNumbers.length <= 2 
                    ? 'grid-cols-1 md:grid-cols-2' 
                    : questionNumbers.length === 3
                      ? 'grid-cols-1 md:grid-cols-3'
                      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
                }`}>
                  {questionNumbers.map((number, index) => (
                    <RandomNumber
                      key={index}
                      number={number}
                      index={index}
                      onRandomize={() => handleRandomizeQuestion(index)}
                      isGenerating={generatingQuestions.has(index)}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xl text-center text-muted-foreground">
              {t("randomizer.noParticipant")}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/randomizer")({
  component: RouteComponent,
});
