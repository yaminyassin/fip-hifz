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
import { Button } from "@/components/shadcn/button";
import { Eye } from "lucide-react";
import { useState } from "react";
import { ScoreDetailsDialog } from "@/components/ui/ScoreDetailsDialog";

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
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantWithScores | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const handleOpenDetails = (participant: ParticipantWithScores) => {
    setSelectedParticipant(participant);
    setIsDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedParticipant(null);
  };

  return (
    <>
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
              <TableHead className="font-bold">{t("participants.table.totalScore")}</TableHead>
              <TableHead>{t("participants.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((participant) => {
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
                  <TableCell className="font-bold">
                    {finalScore > 0 ? `${finalScore.toFixed(1)}%` : "-"}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-1"
                      onClick={() => handleOpenDetails(participant)}
                      disabled={!participant.questionScores || Object.keys(participant.questionScores).length === 0}
                      aria-label={t("participants.actions.viewDetails")}
                    >
                      <Eye className="h-4 w-4" />
                      {t("participants.actions.details")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedParticipant && (
        <ScoreDetailsDialog
          participant={selectedParticipant}
          isOpen={isDetailsOpen}
          onClose={handleCloseDetails}
        />
      )}
    </>
  );
};
