import { Participant, QuestionFields } from "@/models/models";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { useTranslation } from "react-i18next";

type ParticipantWithScores = Participant & {
  questionScores?: {
    [key: number]: QuestionFields;
  };
};

interface ParticipantsTableProps {
  participants: ParticipantWithScores[];
}

export const ParticipantsTable = ({ participants }: ParticipantsTableProps) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("participants.table.name")}</TableHead>
            <TableHead>{t("participants.table.age")}</TableHead>
            <TableHead>{t("participants.table.country")}</TableHead>
            <TableHead>{t("participants.table.category")}</TableHead>
            <TableHead>{t("participants.table.school")}</TableHead>
            <TableHead>{t("participants.table.schedule")}</TableHead>
            <TableHead>{t("participants.table.status")}</TableHead>
            <TableHead>{t("participants.table.q1Total")}</TableHead>
            <TableHead>{t("participants.table.q2Total")}</TableHead>
            <TableHead>{t("participants.table.q3Total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => {
            const getQuestionTotal = (questionNumber: number) => {
              const scores = participant.questionScores?.[questionNumber];
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
                  {participant.isDone 
                    ? t("participants.table.statusComplete") 
                    : t("participants.table.statusPending")}
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
