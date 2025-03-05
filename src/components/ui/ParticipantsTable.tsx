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
import { calculateFinalScore } from "@/utils/scoreUtils";

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
    <div className="overflow-x-auto w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("participants.table.name")}</TableHead>
            <TableHead>{t("participants.table.age")}</TableHead>
            <TableHead>{t("participants.table.country")}</TableHead>
            <TableHead>{t("participants.table.category")}</TableHead>
            <TableHead>{t("participants.table.school")}</TableHead>
            <TableHead>{t("participants.table.scheduled")}</TableHead>
            <TableHead>{t("participants.table.status")}</TableHead>
            <TableHead>{t("participants.table.q1Score")}</TableHead>
            <TableHead>{t("participants.table.q2Score")}</TableHead>
            <TableHead>{t("participants.table.q3Score")}</TableHead>
            <TableHead className="font-bold">{t("participants.table.totalScore")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => {
            // Calculate score for each question using the new scoring system
            const getQuestionScore = (questionNumber: number) => {
              const scores = participant.questionScores?.[questionNumber];
              if (!scores) return 0;
              
              // Return raw sum for each question (for individual question display)
              const totalErrors = 
                scores.hifz_fath + 
                scores.hifz_tannin + 
                scores.hifz_taraddud + 
                scores.tajweed_jali + 
                scores.tajweed_khafi + 
                scores.waqf_ibtida;
                
              const totalFluency = scores.fluency_bonus;
              
              // Simple indicator of errors vs bonuses for question columns
              return totalFluency - totalErrors;
            };
            
            // Calculate final percentage score using all questions
            const getFinalScore = () => {
              if (!participant.questionScores) return 0;
              
              const totalQuestions = Object.keys(participant.questionScores).length;
              if (totalQuestions === 0) return 0;
              
              const result = calculateFinalScore(participant.questionScores, totalQuestions);
              return result.percentage;
            };

            const finalScore = getFinalScore();

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
                    {getQuestionScore(questionNumber)}
                  </TableCell>
                ))}
                <TableCell className="font-bold">
                  {finalScore > 0 ? `${finalScore.toFixed(1)}%` : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
