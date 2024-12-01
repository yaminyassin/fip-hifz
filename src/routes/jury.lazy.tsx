import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Scoring } from "@/components/ui/scoring";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useParticipant } from "@/hooks/useParticipant";
import { useScores } from "@/hooks/useScores";

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});

// Add these as props or get from context/state management
const juryId = "current-jury-id";
const participantId = "current-participant-id";

function RouteComponent() {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const { data: participant } = useParticipant(participantId);

  return (
    <div className="flex flex-row bg-gray-400">
      <div className="flex flex-col w-2/3">
        <div className="p-4 space-y-4 flex-grow">
          <h2 className="text-2xl font-bold mb-4">
            Question {participant?.assignedQuestions[selectedQuestion - 1]}
          </h2>
          <ScoreCategory
            title="Hifz"
            labels={["Reminder", "Assisted or Mistakes"]}
            juryId={juryId}
            participantId={participantId}
            question={selectedQuestion}
            category="Hifz"
          />
          <ScoreCategory
            title="Tajweed"
            labels={["Minor Mistakes", "Major Mistakes"]}
            juryId={juryId}
            participantId={participantId}
            question={selectedQuestion}
            category="Tajweed"
          />
          <ScoreCategory
            title="Fluency"
            labels={["Fluency"]}
            juryId={juryId}
            participantId={participantId}
            question={selectedQuestion}
            category="Fluency"
          />
        </div>

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

      <div className="flex flex-col w-1/3 bg-red-900">
        <h1>Quran pdf</h1>
      </div>
    </div>
  );
}

type ScoreCategoryProps = {
  title: string;
  labels: string[];
  juryId: string;
  participantId: string;
  question: number;
  category: string;
};

const ScoreCategory = ({
  title,
  labels,
  juryId,
  participantId,
  question,
  category,
}: ScoreCategoryProps) => {
  const { data: scores } = useScores(participantId, juryId, question);

  return (
    <div className="flex flex-col bg-red-300 p-4 items-start gap-y-2">
      <Label className="text-2xl">{title}</Label>
      <div className="flex flex-row justify-evenly w-2/3">
        {labels.map((label) => {
          const scoreKey = `${category}_${label.replace(/\s+/g, "")}`;
          return (
            <Scoring
              key={`${category}-${label}`}
              label={label}
              juryId={juryId}
              participantId={participantId}
              question={question}
              category={scoreKey}
              initialScore={scores?.scores?.[scoreKey] ?? 0}
            />
          );
        })}
      </div>
    </div>
  );
};
