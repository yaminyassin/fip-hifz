import { useState, useEffect } from "react";
import { Button } from "../shadcn/button";
import { Label } from "../shadcn/label";
import { Card } from "../shadcn/card";
import { useTranslation } from "react-i18next";

import { QuestionFields } from "../../models/models";
import { storeScore } from "../../services/scores";

interface ScoreInputProps {
  label: string;
  field: keyof QuestionFields;
  juryId: string;
  participantId?: string;
  questionNumber: number;
  initialScore?: number;
  onScoreChange?: (field: keyof QuestionFields, value: number) => void;
}

export const ScoreInput = ({
  label,
  field,
  juryId,
  participantId,
  questionNumber,
  initialScore = 0,
  onScoreChange,
}: ScoreInputProps) => {
  const [score, setScore] = useState(initialScore);
  const { t } = useTranslation();

  useEffect(() => {
    if (initialScore !== undefined) {
      setScore(initialScore);
    }
  }, [initialScore]);

  const handleScoreChange = async (newScore: number) => {
    if (newScore < 0 || newScore > 10) return;
    if (!participantId) return;

    setScore(newScore);
    onScoreChange?.(field, newScore);

    try {
      const scores = {
        hifz_reminder: 0,
        hifz_assistance: 0,
        tajweed_minor: 0,
        tajweed_major: 0,
        fluency: 0,
        [field]: newScore,
      };

      await storeScore(participantId, juryId, questionNumber, scores);
    } catch (error) {
      console.error(t("common.error"), error);
    }
  };

  return (
    <Card className="w-36 p-2">
      <div className="flex flex-col gap-y-4 justify-center">
        <div className="flex text-center justify-center w-full">
          <Label className="flex items-center justify-center px-1 text-muted-foreground">
            {t(label)}
          </Label>
        </div>
        <div className="flex justify-center flex-row gap-2">
          <Button
            size="sm"
            onClick={() => handleScoreChange(score - 1)}
            disabled={score <= 0}
            aria-label={t("jury.actions.decrease")}
          >
            -
          </Button>

          <div className="flex text-center justify-center align-center border border-gray-700 rounded-sm">
            <Label className="flex items-center justify-center w-8 max-w-8">
              {score}
            </Label>
          </div>

          <Button
            size="sm"
            onClick={() => handleScoreChange(score + 1)}
            disabled={score >= 10}
            aria-label={t("jury.actions.increase")}
          >
            +
          </Button>
        </div>
      </div>
    </Card>
  );
};
