import { Participant, QuestionFields } from "@/models/models";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";

type ParticipantWithScores = Participant & {
  questionScores: {
    [key: number]: QuestionFields;
  };
};

interface ParticipantsTableProps {
  participants: ParticipantWithScores[];
}

export const ParticipantsTable = ({ participants }: ParticipantsTableProps) => {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>School</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Q1 Total</TableHead>
            <TableHead>Q2 Total</TableHead>
            <TableHead>Q3 Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => {
            const getQuestionTotal = (questionNumber: number) => {
              const scores = participant.questionScores[questionNumber];
              if (!scores) return 0;
              return Object.values(scores).reduce(
                (sum, score) => sum + score,
                0
              );
            };

            return (
              <TableRow key={participant.id}>
                <TableCell>{participant.name}</TableCell>
                <TableCell>{participant.age}</TableCell>
                <TableCell>{participant.country}</TableCell>
                <TableCell>{participant.category}</TableCell>
                <TableCell>{participant.school}</TableCell>
                <TableCell>{participant.scheduled}</TableCell>
                <TableCell>
                  {participant.isDone ? "Complete" : "Pending"}
                </TableCell>
                {[1, 2, 3].map((questionNumber) => (
                  <TableCell key={questionNumber}>
                    {getQuestionTotal(questionNumber)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
