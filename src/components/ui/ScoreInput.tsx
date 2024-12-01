import { useState, useEffect } from "react";
import { Button } from "../shadcn/button";
import { Label } from "../shadcn/label";
import { Card } from "../shadcn/card";
import { doc, setDoc } from "firebase/firestore";
import { firestore } from "@/main";

type ScoringProps = {
  label?: string;
  juryId: string;
  participantId: string;
  question: number; // The number of the question being scored
  category: string; // "Hifz", "Tajweed", or "Fluency"
  onScoreChange?: (score: number) => void;
  initialScore?: number;
};

export const ScoreInput = (props: ScoringProps) => {
  const {
    label,
    juryId,
    participantId,
    question,
    category,
    onScoreChange,
    initialScore = 0,
  } = props;
  const [score, setScore] = useState(initialScore);

  useEffect(() => {
    setScore(initialScore);
  }, [initialScore, question]);

  const updateScore = (newScore: number) => {
    setScore(newScore);
    onScoreChange?.(newScore);

    const recordRef = doc(
      firestore,
      "records",
      `${participantId}_${juryId}_${question}`
    );
    setDoc(
      recordRef,
      {
        id: `${participantId}_${juryId}_${question}`,
        participantId,
        jurorId: juryId,
        questionNumber: question,
        scores: {
          [`${category}`]: newScore,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  return (
    <Card className="w-36 p-2">
      <div className="flex flex-col gap-y-4 justify-center">
        {
          <div className="flex text-center justify-center w-full">
            {label && (
              <Label className="flex items-center justify-center px-1 text-muted-foreground">
                {label}
              </Label>
            )}
          </div>
        }
        <div className="flex justify-center flex-row gap-2">
          <div>
            <Button
              size="sm"
              onClick={() => {
                if (score - 1 >= 0) {
                  updateScore(score - 1);
                }
              }}
            >
              -
            </Button>
          </div>

          <div className="flex text-center justify-center align-center border border-gray-700 rounded-sm">
            <Label className="flex items-center justify-center w-8 max-w-8">
              {score}
            </Label>
          </div>

          <div>
            <Button size="sm" onClick={() => updateScore(score + 1)}>
              +
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
