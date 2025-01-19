import { Button } from "@/components/shadcn/button";
import { ScoreInput } from "@/components/ui/ScoreInput";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useScores } from "@/hooks/useScores";
import { QuranViewer } from "@/components/ui/QuranViewer";
import { useActiveParticipant } from "../hooks/useActiveParticipant";

import { QuestionFields } from "../models/models";
import { Card } from "../components/shadcn/card";
import { ParticipantBanner } from "../components/ui/ParticipantBanner";
export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});

// Add these as props or get from context/state management
const juryId = "SsqIITjOvucdNyEpx16m";

function RouteComponent() {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const { data: participant } = useActiveParticipant();

  const currentPage = participant?.assignedQuestions[selectedQuestion - 1];

  return (
    <div className="flex flex-row bg-gray-400 px-4">
      <div className="flex flex-col w-4/6">
        <div className="p-4 space-y-4 flex-grow">
          <ParticipantBanner />
          <h2 className="text-2xl font-bold mb-4">
            Question {selectedQuestion} - Page
            {" " + participant?.assignedQuestions[selectedQuestion - 1]}
          </h2>

          <ScoreCategory
            title="Hifz"
            labels={["Reminder", "Assisted"]}
            fields={["hifz_reminder", "hifz_assitance"]}
            juryId={juryId}
            participantId={participant?.id}
            questionNumber={selectedQuestion}
          />
          <ScoreCategory
            title="Tajweed"
            labels={["Minor Mistakes", "Major Mistakes"]}
            fields={["tajweed_minor", "tajweed_major"]}
            juryId={juryId}
            participantId={participant?.id}
            questionNumber={selectedQuestion}
          />
          <ScoreCategory
            title="Fluency"
            labels={["Fluency"]}
            fields={["fluency"]}
            juryId={juryId}
            participantId={participant?.id}
            questionNumber={selectedQuestion}
          />

          {/* Bottom Navigation Bar */}
          <div className="flex flex-row items-center bg-gray-300 p-4 gap-4 mt-auto">
            <div className="flex flex-row gap-4">
              {[1, 2, 3].map((q) => (
                <Button
                  key={q}
                  className={`h-12 w-20 rounded-lg  text-white font-bold transition-colors`}
                  onClick={() => setSelectedQuestion(q)}
                >
                  Q{q}
                </Button>
              ))}
            </div>
            <div className="flex-grow" />
            <Button
              className="h-12 px-6 rounded-lg bg-green-600 text-white font-bold hover:bg-green-500 transition-colors"
              // onClick={handleSubmit}
            >
              Done
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col w-2/6">
        <QuranViewer pageNumber={currentPage} />
      </div>
    </div>
  );
}

interface ScoreCategoryProps {
  title: string;
  labels: string[];
  fields: (keyof QuestionFields)[];
  juryId: string;
  participantId?: string;
  questionNumber: number;
}

export const ScoreCategory = ({
  title,
  labels,
  fields,
  juryId,
  participantId,
  questionNumber,
}: ScoreCategoryProps) => {
  const { data: scores, isLoading } = useScores({
    juryId,
    participantId,
    questionNumber,
  });

  if (isLoading) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="flex gap-4">
          {fields.map((field) => (
            <Card key={field} className="w-36 p-2 animate-pulse">
              <div className="flex flex-col gap-y-4 justify-center">
                <div className="flex text-center justify-center w-full">
                  <div className="h-4 w-20 bg-muted rounded" />
                </div>
                <div className="flex justify-center flex-row gap-2">
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="flex gap-4">
        {fields.map((field, index) => (
          <ScoreInput
            key={field}
            label={labels[index]}
            field={field}
            juryId={juryId}
            participantId={participantId}
            questionNumber={questionNumber}
            initialScore={scores?.scores?.[field] ?? 0}
          />
        ))}
      </div>
    </Card>
  );
};
