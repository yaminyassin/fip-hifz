import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { ParticipantBanner } from "@/components/ui/ParticipantBanner";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useUpdateParticipantQuestions } from "@/hooks/useParticipant";

const RandomNumber = ({ number, index }: { number: number; index: number }) => {
  const [displayNumber, setDisplayNumber] = useState(number);

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
    <div className="flex flex-col gap-y-2">
      <div className="text-4xl">Question {index}</div>
      <div
        className={
          "flex justify-center self-center w-24 h-12 border-2 rounded-sm border-gray-800"
        }
      >
        <Label className="flex flex-col text-center justify-center text-2xl">
          {displayNumber === 0 ? "" : displayNumber}
        </Label>
      </div>
    </div>
  );
};

const RouteComponent = () => {
  const [random1, setRandom1] = useState(0);
  const [random2, setRandom2] = useState(0);
  const [random3, setRandom3] = useState(0);

  const updateQuestions = useUpdateParticipantQuestions();

  const handlePress = () => {
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
      updateQuestions.mutate({
        participantId: "current-participant-id",
        questions: [final1, final2, final3],
      });
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-y-4 justify-center items-center bg-green-200">
      <ParticipantBanner />

      <div className="flex flex-row gap-x-20">
        <RandomNumber number={random1} index={1} />
        <RandomNumber number={random2} index={2} />
        <RandomNumber number={random3} index={3} />
      </div>
      <Button className="flex w-1/2" onClick={handlePress} size="lg">
        <Label className="text-xl">Generate Questions</Label>
      </Button>
    </div>
  );
};

export const Route = createLazyFileRoute("/randomizer")({
  component: RouteComponent,
});
