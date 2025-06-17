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
import { Eye, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { ScoreDetailsDialog } from "@/components/ui/ScoreDetailsDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Input } from "@/components/shadcn/input";

// Updated to include the new score format
type ParticipantWithScores = Participant & {
  questionScores?: {
    byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
    average: { [questionNumber: number]: QuestionFields };
    juryIds: string[];
  };
  overallBonuses?: Record<string, number>; // juryId -> overallBonus value
};

interface ParticipantsTableProps {
  participants: ParticipantWithScores[];
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
    useState<ParticipantWithScores | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const handleOpenDetails = (participant: ParticipantWithScores) => {
    setSelectedParticipant(participant);
    setIsDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedParticipant(null);
  };

  // Get unique categories from participants
  const categories = useMemo(() => {
    const uniqueCategories = new Set(
      participants.map((p) => p.category).filter(Boolean)
    );
    // Ensure 'all' is always an option
    return ["all", ...Array.from(uniqueCategories).sort()];
  }, [participants]);

  // Filter participants based on selected category and search term
  const filteredParticipants = useMemo(() => {
    let filtered = participants;

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Filter by search term (case-insensitive)
    if (searchTerm.trim()) {
      const normalizedSearchTerm = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((p) =>
        (p.name || "").toLowerCase().includes(normalizedSearchTerm)
      );
    }

    return filtered;
  }, [participants, selectedCategory, searchTerm]);

  // Group filtered participants by scheduled value
  const groupedParticipants = useMemo(() => {
    const groups = new Map<string, ParticipantWithScores[]>();

    filteredParticipants.forEach((participant) => {
      const scheduledValue = participant.scheduled || "Unscheduled";
      if (!groups.has(scheduledValue)) {
        groups.set(scheduledValue, []);
      }
      groups.get(scheduledValue)!.push(participant);
    });

    // Sort groups by scheduled value (treat as numbers if possible, otherwise alphabetically)
    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      // Try to parse as numbers first
      const numA = parseInt(a);
      const numB = parseInt(b);

      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }

      // If not numbers, sort alphabetically, but put "Unscheduled" last
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a.localeCompare(b);
    });

    return sortedGroups;
  }, [filteredParticipants]);

  // Render participant row
  const renderParticipantRow = (participant: ParticipantWithScores) => {
    // Calculate final percentage score using average scores
    const getFinalScore = () => {
      if (!participant.questionScores) return 0;
      if (!participant.questionScores.average) return 0;

      const totalQuestions = Object.keys(
        participant.questionScores.average
      ).length;
      if (totalQuestions === 0) return 0;

      // Calculate average overall bonus across all juries
      let averageOverallBonus = 0;
      if (
        participant.overallBonuses &&
        participant.questionScores.juryIds.length > 0
      ) {
        const totalBonus = participant.questionScores.juryIds.reduce(
          (sum, juryId) => {
            return sum + (participant.overallBonuses?.[juryId] || 0);
          },
          0
        );
        averageOverallBonus =
          totalBonus / participant.questionScores.juryIds.length;
      }

      const result = calculateFinalScore(
        participant.questionScores.average,
        averageOverallBonus
      );
      return result.percentage;
    };

    const finalScore = getFinalScore();
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
          {finalScore > 0 ? `${finalScore.toFixed(1)} pts` : "-"}
        </TableCell>
        <TableCell>{juryCount > 0 ? juryCount : "-"}</TableCell>
        <TableCell>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => handleOpenDetails(participant)}
            disabled={
              !participant.questionScores ||
              !participant.questionScores.average ||
              Object.keys(participant.questionScores.average).length === 0
            }
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
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Category Filter */}
          <div className="flex items-center space-x-2">
            <label htmlFor="category-filter" className="text-sm font-medium">
              {t("admin.filter.category")}:
            </label>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger id="category-filter" className="w-[180px]">
                <SelectValue placeholder={t("admin.filter.allCategories")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === "all"
                      ? t("admin.filter.allCategories")
                      : category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Input */}
          <div className="flex items-center space-x-2">
            <label htmlFor="search-input" className="text-sm font-medium">
              {t("admin.filter.search")}:
            </label>
            <Input
              id="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("admin.filter.searchPlaceholder")}
              className="w-[200px]"
            />
          </div>
        </div>

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
