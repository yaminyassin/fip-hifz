import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { ParticipantBanner } from "@/components/ui/ParticipantBanner";
import { createLazyFileRoute } from "@tanstack/react-router";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useUpdateParticipantQuestion } from "@/hooks/useUpdateParticipantQuestion";
import { useUpdateActiveQuestion } from "@/hooks/useUpdateActiveQuestion";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { getCategoryConfig, generateRandomPage } from "@/lib/quranUtils";
import { Participant } from "@/models/models";
import {
  // setPreviousQuestions,
  getPreviousQuestions,
  addToPreviousQuestions,
} from "@/services/appConfig";

// Import assets
import backgroundImage from "@/assets/randomizer/background.png";
import A1 from "@/assets/categories/A1.png";
import A2 from "@/assets/categories/A2.png";
import B1 from "@/assets/categories/B1.png";
import B2 from "@/assets/categories/B2.png";
import C1 from "@/assets/categories/C1.png";
import C2 from "@/assets/categories/C2.png";
import D1 from "@/assets/categories/D1.png";
import D2 from "@/assets/categories/D2.png";
import M from "@/assets/categories/M.png";

const categoryImageMap: Record<string, string> = {
  A1,
  A2,
  B1,
  B2,
  C1,
  C2,
  D1,
  D2,
  M,
};

// Memoize the RandomNumber component to prevent unnecessary re-renders
const RandomNumber = React.memo(
  ({ number, index }: { number: number; index: number }) => {
    const [displayNumber, setDisplayNumber] = useState(number);
    const { t } = useTranslation();

    useEffect(() => {
      let intervalId: NodeJS.Timeout | undefined = undefined;

      if (number === 0) {
        setDisplayNumber(0); // Ensure it shows "..." or similar immediately
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
      <div className="w-48 h-48 flex flex-col items-center justify-center shadow-lg border border-[#5E618B80] p-4">
        <div className="flex flex-col items-center justify-center space-y-4 w-full">
          <div className="text-2xl sm:text-3xl lg:text-4xl text-[#3D435D] text-center whitespace-nowrap">
            {t("randomizer.questionLabel", { number: index + 1 })}
          </div>
          <div className="flex items-center justify-center rounded-lg border-2 border-[#9DA3AE] px-6 py-3 shadow-sm min-w-[100px]">
            <Label className="font-cera text-2xl sm:text-3xl lg:text-4xl font-bold text-[#2F3046]">
              {displayNumber === 0 ? "..." : displayNumber}
            </Label>
          </div>
        </div>
      </div>
    );
  }
);

// Add display name for debugging purposes
RandomNumber.displayName = "RandomNumber";

// Define RandomizerContentView component
const RandomizerContentView = React.memo(
  ({
    participant,
    questionNumbers,
    isGeneratingAll,
    isLoadingButton, // Renamed for clarity in button context
    handleStartAllQuestions,
    layoutClass,
    randomNumberComponents,
    t,
    categoryImageMap,
  }: {
    participant: Participant;
    questionNumbers: number[];
    isGeneratingAll: boolean;
    isLoadingButton: boolean;
    handleStartAllQuestions: () => void;
    layoutClass: string;
    randomNumberComponents: JSX.Element[];
    t: TFunction;
    categoryImageMap: Record<string, string>;
  }) => {
    return (
      <>
        <div className="flex flex-col items-center gap-6 md:gap-8 flex-grow bg-[#FFFEFA] p-8">
          {categoryImageMap[participant.category] && (
            <img
              src={
                categoryImageMap[
                  participant.category as keyof typeof categoryImageMap
                ]
              }
              alt={t("randomizer.categoryAltText", {
                category: participant.category,
              })}
              className="w-[260px] object-contain"
            />
          )}

          {questionNumbers.length > 0 ? (
            <div
              className={`${layoutClass} gap-8  w-full max-w-4xl mx-auto flex-grow`}
            >
              {randomNumberComponents}
            </div>
          ) : (
            <div className="text-lg text-center text-gray-300 py-5">
              {t("randomizer.noQuestionsForCategory")}
            </div>
          )}
        </div>
        <div className="mt-6 md:mt-8 w-full flex justify-center">
          <Button
            onClick={handleStartAllQuestions}
            disabled={
              isGeneratingAll || questionNumbers.length === 0 || isLoadingButton
            }
            size="lg"
            className="bg-[#61A8BB] hover:bg-[#00838F] text-[#FFFEFA] text-2xl py-3 px-6 sm:px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#007C8A] focus:ring-opacity-50 min-w-[150px] sm:min-w-[200px]"
            aria-label={t("randomizer.startGenerationAria")}
          >
            {isGeneratingAll ? (
              <div className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {t("randomizer.generatingAll")}
              </div>
            ) : (
              t("randomizer.start")
            )}
          </Button>
        </div>
      </>
    );
  }
);
RandomizerContentView.displayName = "RandomizerContentView";

const RouteComponent = () => {
  const [questionNumbers, setQuestionNumbers] = useState<number[]>([]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // True for initial component mount loading
  const lastActiveParticipantRef = useRef<Participant | null>(null);

  const updateQuestion = useUpdateParticipantQuestion();
  const updateActiveQuestion = useUpdateActiveQuestion();
  const { data: activeParticipant, isLoading: isParticipantLoading } =
    useActiveParticipant();
  const { t } = useTranslation();

  useEffect(() => {
    if (activeParticipant) {
      lastActiveParticipantRef.current = activeParticipant;
      setIsLoading(false);
    } else if (!isParticipantLoading) {
      // No active participant, and participant fetch isn't loading
      lastActiveParticipantRef.current = null; // Clear ref if no active user and not loading
      setIsLoading(false); // Done with initial loading sequence
    }
    // If isParticipantLoading is true, isLoading remains true or as per its last state
    // until activeParticipant is resolved or isParticipantLoading becomes false.
  }, [activeParticipant, isParticipantLoading, setIsLoading]);

  const getNumQuestions = useCallback((participant: Participant | null) => {
    if (!participant) return 0;
    const config = getCategoryConfig(participant.category);
    return config.numQuestions;
  }, []);

  useEffect(() => {
    // If generation is in progress, handleStartAllQuestions is managing questionNumbers.
    // Avoid syncing from activeParticipant to prevent overwriting optimistic updates with potentially stale data.
    if (isGeneratingAll) {
      return;
    }

    const participantToUse =
      activeParticipant || lastActiveParticipantRef.current;

    if (participantToUse) {
      const numQuestions = getNumQuestions(participantToUse);
      let newQuestionsDerivedFromServer = [
        ...(participantToUse.assignedQuestions || []),
      ];
      while (newQuestionsDerivedFromServer.length < numQuestions) {
        newQuestionsDerivedFromServer.push(0); // Use 0 as placeholder for not-yet-generated
      }
      if (newQuestionsDerivedFromServer.length > numQuestions) {
        newQuestionsDerivedFromServer = newQuestionsDerivedFromServer.slice(
          0,
          numQuestions
        );
      }

      // Only update state if the derived questions are different from the current questionNumbers state.
      // This prevents unnecessary re-renders if the server state confirms the optimistic local state.
      if (
        questionNumbers.length !== newQuestionsDerivedFromServer.length ||
        newQuestionsDerivedFromServer.some(
          (nq, idx) => nq !== questionNumbers[idx]
        )
      ) {
        setQuestionNumbers(newQuestionsDerivedFromServer);
      }
    } else {
      // No participant, ensure questions are cleared if not already
      if (questionNumbers.length !== 0) {
        setQuestionNumbers([]);
      }
    }
  }, [activeParticipant, getNumQuestions, isGeneratingAll, questionNumbers]); // Added isGeneratingAll and questionNumbers

  const participant = useMemo(
    () => activeParticipant || lastActiveParticipantRef.current,
    [activeParticipant]
  );

  const handleStartAllQuestions = useCallback(async () => {
    if (!participant || isGeneratingAll) return;

    const numQuestions = getNumQuestions(participant);
    if (numQuestions === 0) {
      console.error(t("randomizer.messages.noQuestionsToGenerate"));
      return;
    }

    setIsGeneratingAll(true);
    console.log(t("randomizer.messages.generationStartingTitle"));

    // Fetch previous questions to avoid duplicates
    const previousQuestions = await getPreviousQuestions();
    console.log(
      `Fetched ${previousQuestions.length} previous questions to avoid`
    );

    setQuestionNumbers(Array(numQuestions).fill(0));

    const generatedPages: number[] = [];

    for (let i = 0; i < numQuestions; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Time for rolling animation per card

      // Pass all previously generated questions (from database + current session) to avoid duplicates
      const allExcludedPages = [...previousQuestions, ...generatedPages];
      const randomPage = generateRandomPage(
        participant.category,
        i,
        allExcludedPages
      );
      generatedPages.push(randomPage);

      setQuestionNumbers((prev) => {
        const updated = [...prev];
        updated[i] = randomPage;
        return updated;
      });

      // Update the active question immediately when the first question is generated
      if (i === 0) {
        updateActiveQuestion.mutate({
          participantId: participant.id,
          activeQuestionPage: randomPage,
        });
      }
    }

    for (let i = 0; i < numQuestions; i++) {
      try {
        await new Promise<void>((resolve, reject) => {
          updateQuestion.mutate(
            {
              participantId: participant.id,
              questionIndex: i,
              pageNumber: generatedPages[i],
            },
            {
              onSuccess: () => resolve(),
              onError: (error) => {
                console.error(`Error updating question ${i + 1}:`, error);
                reject(error); // Reject to mark this specific mutation as failed
              },
            }
          );
        });
      } catch (error) {
        // Error handling for individual mutation already done in onError
        // This catch is for the Promise.reject if a mutation fails
        console.log(`Mutation for question ${i + 1} was rejected.`, error);
      }
    }

    // Replace all previous questions with the newly generated ones in the app_config collection
    try {
      //await setPreviousQuestions(generatedPages);
      await addToPreviousQuestions(generatedPages);
      console.log(
        "Successfully replaced previous questions with newly generated questions in app_config"
      );
    } catch (error) {
      console.error("Error storing questions in app_config:", error);
      // Don't throw here as the main functionality (participant questions) has succeeded
    }

    setIsGeneratingAll(false);

    // Note: Active question is now updated immediately when first question is generated (above)
    // instead of waiting for all questions to be processed
  }, [
    participant,
    isGeneratingAll,
    getNumQuestions,
    updateQuestion,
    updateActiveQuestion,
    t,
    setQuestionNumbers,
    setIsGeneratingAll,
    // generateRandomPage is stable as it's an import
  ]);

  const layoutClass = useMemo(() => {
    // Use flexbox for horizontal flow instead of grid
    return "flex flex-wrap justify-center";
  }, []);

  const randomNumberComponents = useMemo(() => {
    return questionNumbers.map((number, index) => (
      <RandomNumber key={index} number={number} index={index} />
    ));
  }, [questionNumbers]);

  if (
    isLoading || // Initial component loading
    (isParticipantLoading && !lastActiveParticipantRef.current) // Actively fetching and no cached participant to show
  ) {
    return (
      <div
        style={{ backgroundImage: `url(${backgroundImage})` }}
        className="min-h-screen bg-cover bg-center flex items-center justify-center p-4"
      >
        <div className="bg-[#414361] text-white rounded-xl shadow-2xl p-6 sm:p-8 md:p-10 w-full max-w-3xl lg:max-w-4xl flex flex-col items-center justify-center min-h-[400px]">
          <ParticipantBanner />
          <div className="text-xl text-center text-gray-300 py-10">
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ backgroundImage: `url(${backgroundImage})` }}
      className="min-h-screen bg-cover bg-center flex items-center justify-center pt-10 pl-16 pr-20 "
    >
      <div className="bg-[#414361]  rounded-xl shadow-2xl p-6 sm:p-8 md:p-10 w-full flex flex-col">
        <div className="mb-6 md:mb-8">
          <ParticipantBanner />
        </div>

        {participant ? (
          <RandomizerContentView
            participant={participant}
            questionNumbers={questionNumbers}
            isGeneratingAll={isGeneratingAll}
            isLoadingButton={isLoading || isParticipantLoading} // Pass combined loading state for button
            handleStartAllQuestions={handleStartAllQuestions}
            layoutClass={layoutClass}
            randomNumberComponents={randomNumberComponents}
            t={t}
            categoryImageMap={categoryImageMap}
          />
        ) : (
          <div className="flex flex-col items-center gap-6 md:gap-8 flex-grow">
            <div className="text-xl text-center text-gray-300 py-10">
              {t("randomizer.noParticipant")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/randomizer")({
  component: RouteComponent,
});
