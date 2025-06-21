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
import { Button } from "@/components/shadcn/button";
import { Eye, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { ScoreDetailsDialog } from "@/components/ui/ScoreDetailsDialog";

// This type will now include the calculated scores from the parent
type ParticipantWithCalculatedScores = Participant & {
  finalScore: number;
  breakdown: {
    hifdh: number;
    tajweed: number;
    waqf: number;
    husn_al_ada: number;
    overall_bonus: number;
  };
  questionScores?: {
    byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
    average: { [questionNumber: number]: QuestionFields };
    juryIds: string[];
  };
  overallBonuses?: Record<string, number>;
};

interface ParticipantsTableProps {
  participants: ParticipantWithCalculatedScores[];
  isLoading?: boolean;
  isFetching?: boolean;
}

export const ParticipantsTable = ({
  participants,
  isLoading = false,
  isFetching = false,
}: ParticipantsTableProps) => {
  const { t } = useTranslation();
  const [selectedParticipant, setSelectedParticipant] =
    useState<ParticipantWithCalculatedScores | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const handleOpenDetails = (participant: ParticipantWithCalculatedScores) => {
    setSelectedParticipant(participant);
    setIsDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedParticipant(null);
  };

  // Group participants by scheduled value (filtering is now done in parent)
  const groupedParticipants = useMemo(() => {
    const groups = new Map<string, ParticipantWithCalculatedScores[]>();

    participants.forEach((participant) => {
      const scheduledValue = participant.scheduled || "Unscheduled";
      if (!groups.has(scheduledValue)) {
        groups.set(scheduledValue, []);
      }
      groups.get(scheduledValue)!.push(participant);
    });

    // Sort groups by scheduled value
    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });

    return sortedGroups;
  }, [participants]);

  // Render participant row
  const renderParticipantRow = (participant: ParticipantWithCalculatedScores) => {
    const juryCount = participant.questionScores?.juryIds?.length || 0;

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
          {participant.finalScore > 0
            ? `${participant.finalScore.toFixed(1)} pts`
            : "-"}
        </TableCell>
        <TableCell>{juryCount > 0 ? juryCount : "-"}</TableCell>
        <TableCell>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => handleOpenDetails(participant)}
            disabled={!participant.isDone || participant.finalScore < 0}
            aria-label={t("participants.actions.viewDetails")}
          >
            <Eye className="h-4 w-4" />
            {t("participants.actions.details")}
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  // Use isLoading for initial load
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-label={t("common.loading")}
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Loading indicator for refetches */}
        {isFetching && !isLoading && (
          <div className="absolute top-0 left-0 right-0 flex justify-center p-2 opacity-75">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Grouped Participants Tables */}
        <div className="space-y-6 relative">
          {groupedParticipants.length === 0 ? (
            <div className="border rounded-md">
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
                      <TableHead className="font-bold">
                        {t("participants.table.totalScore")}
                      </TableHead>
                      <TableHead>{t("participants.table.juryCount")}</TableHead>
                      <TableHead>{t("participants.table.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {t("admin.participants.noParticipants")}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            groupedParticipants.map(([scheduledValue, groupParticipants]) => (
              <div key={scheduledValue} className="space-y-2">
                {/* Group Header */}
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t("admin.participants.scheduledGroup", {
                      scheduled: scheduledValue,
                    })}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    ({groupParticipants.length}{" "}
                    {groupParticipants.length === 1
                      ? t("admin.participants.participant")
                      : t("admin.participants.participants")}
                    )
                  </span>
                </div>

                {/* Group Table */}
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("participants.table.name")}</TableHead>
                        <TableHead>{t("participants.table.age")}</TableHead>
                        <TableHead>{t("participants.table.country")}</TableHead>
                        <TableHead>
                          {t("participants.table.category")}
                        </TableHead>
                        <TableHead>{t("participants.table.school")}</TableHead>
                        <TableHead>
                          {t("participants.table.scheduled")}
                        </TableHead>
                        <TableHead>{t("participants.table.status")}</TableHead>
                        <TableHead className="font-bold">
                          {t("participants.table.totalScore")}
                        </TableHead>
                        <TableHead>
                          {t("participants.table.juryCount")}
                        </TableHead>
                        <TableHead>{t("participants.table.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupParticipants.map(renderParticipantRow)}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))
          )}
        </div>
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
