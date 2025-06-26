import { createLazyFileRoute } from "@tanstack/react-router";
import { ParticipantsTable } from "@/components/ui/ParticipantsTable";
import { ParticipantScoreVisualizations } from "@/components/ui/ParticipantScoreVisualizations";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Input } from "@/components/shadcn/input";
import { Search, Filter, ListFilter, Download } from "lucide-react";
import { useState } from "react";
import {
  useParticipants,
  ParticipantWithScores,
} from "@/hooks/useParticipants";
import { useJuryMembers } from "@/hooks/useJuryMembers";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Button } from "@/components/shadcn/button";

// Simple dialog component for export options
const ExportDialog = ({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

// Simple checkbox component
const CheckboxItem = ({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) => (
  <div className="flex items-center space-x-2">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="h-4 w-4 rounded border-gray-300"
    />
    <span className="text-sm">{children}</span>
  </div>
);
import { calculateFinalScore } from "@/utils/scoreUtils";
import {
  fillMissingQuestionsAndCalculateAverage,
  fillMissingQuestionsWithPerfectScores,
  categoryConfigs,
} from "@/lib/quranUtils";
import { QuestionFields } from "@/models/models";
import * as XLSX from "xlsx";

export const Route = createLazyFileRoute("/participants")({
  component: RouteComponent,
});

function RouteComponent() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: participants = [], isLoading } = useParticipants();
  const { data: juryMembers = [] } = useJuryMembers();
  const { t } = useTranslation();

  const allSubCategories = useMemo(
    () =>
      Object.values(categoryConfigs)
        .flatMap((config) => config.questionRanges.map((range) => range.name))
        .sort(),
    []
  );

  const nonMCategories = useMemo(
    () =>
      Object.entries(categoryConfigs)
        .filter(([key]) => key !== "M")
        .flatMap(([, config]) =>
          config.questionRanges.map((range) => range.name)
        ),
    []
  );

  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "all",
  ]);
  const [sortOption, setSortOption] = useState("finalScore_desc");
  const [selectedSchedule, setSelectedSchedule] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedJuriesForExport, setSelectedJuriesForExport] = useState<
    string[]
  >([]);
  const [exportWithJuryFilter, setExportWithJuryFilter] = useState(false);

  const searchFilteredParticipants = useMemo(
    () =>
      participants.filter((participant) =>
        participant.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [participants, searchQuery]
  );

  // Get unique schedules for filter dropdown
  const availableSchedules = useMemo(() => {
    const schedules = new Set<string>();
    participants.forEach((p) => {
      const schedule = p.scheduled || "Unscheduled";
      schedules.add(schedule);
    });
    return Array.from(schedules).sort((a, b) => {
      // Put "Unscheduled" at the end
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      // Try to sort numerically if possible
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }, [participants]);

  // Get all available juries from participants
  const availableJuries = useMemo(() => {
    const allJuryIds = new Set<string>();
    participants.forEach((p) => {
      if (p.questionScores?.juryIds) {
        p.questionScores.juryIds.forEach((id) => allJuryIds.add(id));
      }
    });
    return Array.from(allJuryIds).sort();
  }, [participants]);

  // Create jury ID to name mapping
  const juryIdToName = useMemo(() => {
    const mapping = new Map<string, string>();
    juryMembers.forEach((jury) => {
      mapping.set(jury.id, jury.name || `Jury ${jury.id}`);
    });
    return mapping;
  }, [juryMembers]);

  // Function to filter participant scores by selected juries
  const filterParticipantScoresByJuries = (
    participant: ParticipantWithScores,
    selectedJuries: string[]
  ) => {
    if (!exportWithJuryFilter || selectedJuries.length === 0) {
      return participant; // Return original if no filtering
    }

    // Check if participant has scores from ALL selected juries
    const hasAllSelectedJuries = selectedJuries.every(
      (juryId) =>
        participant.questionScores.byJury[juryId] &&
        Object.keys(participant.questionScores.byJury[juryId]).length > 0
    );

    if (!hasAllSelectedJuries) {
      // Return participant with empty scores if they don't have all required jury evaluations
      return {
        ...participant,
        questionScores: {
          byJury: {},
          average: {},
          juryIds: [],
        },
        overallBonuses: {},
      };
    }

    // Filter the jury scores to only include selected juries
    const filteredByJury: Record<
      string,
      { [questionNumber: number]: QuestionFields }
    > = {};
    const filteredJuryIds: string[] = [];
    const filteredOverallBonuses: Record<string, number> = {};

    selectedJuries.forEach((juryId) => {
      if (participant.questionScores.byJury[juryId]) {
        filteredByJury[juryId] = participant.questionScores.byJury[juryId];
        filteredJuryIds.push(juryId);
      }
      if (participant.overallBonuses[juryId] !== undefined) {
        filteredOverallBonuses[juryId] = participant.overallBonuses[juryId];
      }
    });

    // Recalculate average scores with filtered juries
    const filteredQuestionScores = {
      byJury: filteredByJury,
      average: {}, // Will be recalculated
      juryIds: filteredJuryIds,
    };

    return {
      ...participant,
      questionScores: filteredQuestionScores,
      overallBonuses: filteredOverallBonuses,
    };
  };

  const processedParticipants = useMemo(() => {
    // Determine which categories to use for filtering
    const isAllSelected =
      selectedCategories.length === 1 && selectedCategories[0] === "all";
    const activeCategories = isAllSelected
      ? nonMCategories
      : selectedCategories;

    // 1. Filter by category
    let categoryFiltered =
      activeCategories.length > 0
        ? searchFilteredParticipants.filter((participant) =>
            activeCategories.includes(participant.category)
          )
        : []; // If no categories are selected, show no participants

    // 2. Filter by schedule
    if (selectedSchedule !== "all") {
      categoryFiltered = categoryFiltered.filter((participant) => {
        const schedule = participant.scheduled || "Unscheduled";
        return schedule === selectedSchedule;
      });
    }

    // 3. Calculate scores for sorting
    const withScores = categoryFiltered.map((p) => {
      if (
        !p.isDone ||
        !p.questionScores?.juryIds ||
        p.questionScores.juryIds.length === 0
      ) {
        return {
          ...p,
          finalScore: -1,
          breakdown: {
            hifdh: 0,
            tajweed: 0,
            waqf: 0,
            husn_al_ada: 0,
            overall_bonus: 0,
          },
        };
      }

      const filledAverageScores = fillMissingQuestionsAndCalculateAverage(
        p.questionScores,
        p.category
      );
      let averageOverallBonus = 0;
      if (p.overallBonuses && p.questionScores?.juryIds.length) {
        const totalBonus = p.questionScores.juryIds.reduce(
          (sum, juryId) => sum + (p.overallBonuses?.[juryId] || 0),
          0
        );
        averageOverallBonus = totalBonus / p.questionScores.juryIds.length;
      }
      const scoreResult = calculateFinalScore(
        filledAverageScores,
        averageOverallBonus
      );
      return {
        ...p,
        finalScore: scoreResult.percentage,
        breakdown: scoreResult.breakdownBySection,
      };
    });

    // 4. Sort
    return withScores.sort((a, b) => {
      const [sortKey, sortOrder] = sortOption.split("_");
      const direction = sortOrder === "asc" ? 1 : -1;

      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * direction;
        case "bonus":
          return (
            (a.breakdown.overall_bonus - b.breakdown.overall_bonus) * direction
          );
        case "finalScore":
        default:
          // Participants without scores should be at the bottom
          if (a.finalScore === -1 && b.finalScore > -1) return 1;
          if (b.finalScore === -1 && a.finalScore > -1) return -1;
          return (a.finalScore - b.finalScore) * direction;
      }
    });
  }, [
    searchFilteredParticipants,
    selectedCategories,
    sortOption,
    selectedSchedule,
  ]);

  // Excel export function
  const handleExportToExcel = async () => {
    setIsExporting(true);

    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Apply jury filtering if enabled
      const participantsForExport =
        exportWithJuryFilter && selectedJuriesForExport.length > 0
          ? processedParticipants.map((p) =>
              filterParticipantScoresByJuries(p, selectedJuriesForExport)
            )
          : processedParticipants;

      // Recalculate scores for filtered participants
      const recalculatedParticipants = participantsForExport.map((p) => {
        if (
          !p.questionScores?.juryIds ||
          p.questionScores.juryIds.length === 0
        ) {
          return {
            ...p,
            finalScore: -1,
            breakdown: {
              hifdh: 0,
              tajweed: 0,
              waqf: 0,
              husn_al_ada: 0,
              overall_bonus: 0,
            },
          };
        }

        const filledAverageScores = fillMissingQuestionsAndCalculateAverage(
          p.questionScores,
          p.category
        );
        let averageOverallBonus = 0;
        if (p.overallBonuses && p.questionScores?.juryIds.length) {
          const totalBonus = p.questionScores.juryIds.reduce(
            (sum, juryId) => sum + (p.overallBonuses?.[juryId] || 0),
            0
          );
          averageOverallBonus = totalBonus / p.questionScores.juryIds.length;
        }
        const scoreResult = calculateFinalScore(
          filledAverageScores,
          averageOverallBonus
        );
        return {
          ...p,
          finalScore: scoreResult.percentage,
          breakdown: scoreResult.breakdownBySection,
        };
      });

      // Sort recalculated participants by final score
      const sortedParticipants = recalculatedParticipants.sort((a, b) => {
        if (a.finalScore === -1 && b.finalScore > -1) return 1;
        if (b.finalScore === -1 && a.finalScore > -1) return -1;
        return b.finalScore - a.finalScore;
      });

      // Create jury ID to name mapping
      const juryIdToName = new Map<string, string>();
      juryMembers.forEach((jury) => {
        juryIdToName.set(jury.id, jury.name || `Jury ${jury.id}`);
      });

      // 1. Summary Sheet (like participant table)
      const summaryData = sortedParticipants.map((participant, index) => ({
        Rank: index + 1,
        Name: participant.name,
        Age: participant.age,
        Country: participant.country,
        Category: participant.category,
        School: participant.school,
        Scheduled: participant.scheduled || "Unscheduled",
        Status: participant.isDone ? "Complete" : "Pending",
        "Final Score":
          participant.finalScore > 0
            ? `${participant.finalScore.toFixed(2)} pts`
            : "-",
        "Jury Count": participant.questionScores?.juryIds?.length || 0,
      }));

      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      // 2. Detailed Scores Sheet
      const detailedData = sortedParticipants
        .filter((p) => p.finalScore > 0)
        .map((participant, index) => ({
          Rank: index + 1,
          Name: participant.name,
          Category: participant.category,
          "Final Score": `${participant.finalScore.toFixed(2)} pts`,
          "Hifdh Score": `${participant.breakdown.hifdh.toFixed(2)}/50`,
          "Hifdh %": `${((participant.breakdown.hifdh / 50) * 100).toFixed(2)}%`,
          "Tajweed Score": `${participant.breakdown.tajweed.toFixed(2)}/30`,
          "Tajweed %": `${((participant.breakdown.tajweed / 30) * 100).toFixed(2)}%`,
          "Waqf Score": `${participant.breakdown.waqf.toFixed(2)}/10`,
          "Waqf %": `${((participant.breakdown.waqf / 10) * 100).toFixed(2)}%`,
          "Husn al-Ada Deduction": `-${participant.breakdown.husn_al_ada.toFixed(2)} pts`,
          "Overall Bonus": `+${participant.breakdown.overall_bonus.toFixed(2)} pts`,
          "Jury Count": participant.questionScores?.juryIds?.length || 0,
        }));

      const detailedSheet = XLSX.utils.json_to_sheet(detailedData);
      XLSX.utils.book_append_sheet(workbook, detailedSheet, "Detailed Scores");

      // 3. Individual Jury Sheets
      const allJuryIds =
        exportWithJuryFilter && selectedJuriesForExport.length > 0
          ? new Set(selectedJuriesForExport)
          : new Set<string>();

      if (!exportWithJuryFilter || selectedJuriesForExport.length === 0) {
        sortedParticipants.forEach((p) => {
          if (p.questionScores?.juryIds) {
            p.questionScores.juryIds.forEach((id) => allJuryIds.add(id));
          }
        });
      }

      Array.from(allJuryIds)
        .sort()
        .forEach((juryId) => {
          const juryName = juryIdToName.get(juryId) || `Jury ${juryId}`;
          const juryData: any[] = [];

          sortedParticipants
            .filter((p) => p.questionScores?.byJury[juryId])
            .forEach((participant) => {
              const juryScores = participant.questionScores!.byJury[juryId];
              const overallBonus = participant.overallBonuses?.[juryId] || 0;

              // Calculate jury-specific final score
              const filledScores = fillMissingQuestionsWithPerfectScores(
                juryScores,
                participant.category
              );
              const juryResult = calculateFinalScore(
                filledScores,
                overallBonus
              );

              // Add participant header row
              juryData.push({
                Participant: participant.name,
                Category: participant.category,
                Judge: juryName,
                Question: "",
                Page: "",
                "Hifdh Judge Correction": "",
                "Hifdh Self Correction": "",
                "Hifdh Stuck Count": "",
                "Tajweed Major": "",
                "Tajweed Minor": "",
                "Waqf Incorrect": "",
                "Waqf Meaning": "",
                "Husn al-Ada Score": "",
                "Overall Bonus": `${overallBonus.toFixed(2)}`,
                "Final Score": `${juryResult.percentage.toFixed(2)} pts`,
              });

              // Add question details
              Object.entries(filledScores).forEach(([questionNum, scores]) => {
                const questionScores = scores as QuestionFields;
                juryData.push({
                  Participant: "",
                  Category: "",
                  Judge: "",
                  Question: `Q${questionNum}`,
                  Page: "", // You might want to add page info if available
                  "Hifdh Judge Correction":
                    questionScores.hifdh_judge_correction,
                  "Hifdh Self Correction": questionScores.hifdh_self_correction,
                  "Hifdh Stuck Count": questionScores.hifdh_stuck_count,
                  "Tajweed Major": questionScores.tajweed_major,
                  "Tajweed Minor": questionScores.tajweed_minor,
                  "Waqf Incorrect": questionScores.waqf_ibtida_incorrect,
                  "Waqf Meaning": questionScores.waqf_ibtida_meaning,
                  "Husn al-Ada Score": questionScores.husn_al_ada_score,
                  "Overall Bonus": "",
                  "Final Score": "",
                });
              });

              // Add empty row for separation
              juryData.push({
                Participant: "",
                Category: "",
                Judge: "",
                Question: "",
                Page: "",
                "Hifdh Judge Correction": "",
                "Hifdh Self Correction": "",
                "Hifdh Stuck Count": "",
                "Tajweed Major": "",
                "Tajweed Minor": "",
                "Waqf Incorrect": "",
                "Waqf Meaning": "",
                "Husn al-Ada Score": "",
                "Overall Bonus": "",
                "Final Score": "",
              });
            });

          if (juryData.length > 0) {
            const jurySheet = XLSX.utils.json_to_sheet(juryData);
            // Use jury name for sheet name, truncated to Excel's 31 character limit
            const sheetName = juryName.substring(0, 31);
            XLSX.utils.book_append_sheet(workbook, jurySheet, sheetName);
          }
        });

      // 4. Statistics Sheet
      const evaluatedParticipants = sortedParticipants.filter(
        (p) => p.finalScore > 0
      );
      const statsData = [];

      if (evaluatedParticipants.length > 0) {
        const avgHifdh =
          evaluatedParticipants.reduce(
            (sum, p) => sum + (p.breakdown.hifdh / 50) * 100,
            0
          ) / evaluatedParticipants.length;
        const avgTajweed =
          evaluatedParticipants.reduce(
            (sum, p) => sum + (p.breakdown.tajweed / 30) * 100,
            0
          ) / evaluatedParticipants.length;
        const avgWaqf =
          evaluatedParticipants.reduce(
            (sum, p) => sum + (p.breakdown.waqf / 10) * 100,
            0
          ) / evaluatedParticipants.length;
        const avgFinalScore =
          evaluatedParticipants.reduce((sum, p) => sum + p.finalScore, 0) /
          evaluatedParticipants.length;
        const avgBonus =
          evaluatedParticipants.reduce(
            (sum, p) => sum + p.breakdown.overall_bonus,
            0
          ) / evaluatedParticipants.length;
        const avgDeduction =
          evaluatedParticipants.reduce(
            (sum, p) => sum + p.breakdown.husn_al_ada,
            0
          ) / evaluatedParticipants.length;

        statsData.push(
          { Metric: "Total Participants", Value: sortedParticipants.length },
          {
            Metric: "Evaluated Participants",
            Value: evaluatedParticipants.length,
          },
          {
            Metric: "Pending Participants",
            Value: sortedParticipants.length - evaluatedParticipants.length,
          },
          { Metric: "Active Jury Members", Value: allJuryIds.size },
          {
            Metric: "Jury Filtering Applied",
            Value: exportWithJuryFilter ? "Yes" : "No",
          },
          ...(exportWithJuryFilter && selectedJuriesForExport.length > 0
            ? [
                {
                  Metric: "Selected Juries",
                  Value: selectedJuriesForExport
                    .map((id) => juryIdToName.get(id) || id)
                    .join(", "),
                },
              ]
            : []),
          { Metric: "", Value: "" },
          {
            Metric: "Average Final Score",
            Value: `${avgFinalScore.toFixed(2)} pts`,
          },
          {
            Metric: "Highest Score",
            Value: `${evaluatedParticipants[0]?.finalScore.toFixed(2)} pts`,
          },
          {
            Metric: "Lowest Score",
            Value: `${evaluatedParticipants[evaluatedParticipants.length - 1]?.finalScore.toFixed(2)} pts`,
          },
          { Metric: "", Value: "" },
          {
            Metric: "Average Hifdh Retention",
            Value: `${avgHifdh.toFixed(2)}%`,
          },
          {
            Metric: "Average Tajweed Retention",
            Value: `${avgTajweed.toFixed(2)}%`,
          },
          { Metric: "Average Waqf Retention", Value: `${avgWaqf.toFixed(2)}%` },
          { Metric: "", Value: "" },
          {
            Metric: "Average Bonus Points",
            Value: `${avgBonus.toFixed(2)} pts`,
          },
          {
            Metric: "Average Deduction Points",
            Value: `${avgDeduction.toFixed(2)} pts`,
          }
        );

        // Add jury member list
        statsData.push(
          { Metric: "", Value: "" },
          { Metric: "Jury Members:", Value: "" }
        );

        Array.from(allJuryIds)
          .sort()
          .forEach((juryId) => {
            const juryName = juryIdToName.get(juryId) || `Jury ${juryId}`;
            statsData.push({ Metric: `- ${juryName}`, Value: juryId });
          });
      } else {
        statsData.push({
          Metric: "No evaluated participants found",
          Value: "",
        });
      }

      const statsSheet = XLSX.utils.json_to_sheet(statsData);
      XLSX.utils.book_append_sheet(workbook, statsSheet, "Statistics");

      // Generate filename with current date and selected categories
      const selectedCategoryNames = selectedCategories.includes("all")
        ? "All-Categories"
        : selectedCategories.join("-");
      const juryFilterSuffix =
        exportWithJuryFilter && selectedJuriesForExport.length > 0
          ? `-Jury-Filtered-${selectedJuriesForExport.length}`
          : "";
      const currentDate = new Date().toISOString().split("T")[0];
      const filename = `Participants-Export-${selectedCategoryNames}${juryFilterSuffix}-${currentDate}.xlsx`;

      // Write and download the file
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      // You might want to show a toast notification here
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return <div>{t("common.loading")}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {t("participants.header.title")}
          </h1>
          {/* Filters will be here */}
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            {/* Category Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>{t("participants.filter.by_category")}</span>
                  {selectedCategories.length > 0 &&
                    !selectedCategories.includes("all") && (
                      <>
                        <div className="mx-2 h-4 w-px bg-muted-foreground/30" />
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          {selectedCategories.length}
                        </span>
                      </>
                    )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>
                  {t("participants.filter.select_categories")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  key="all"
                  checked={
                    selectedCategories.length === 1 &&
                    selectedCategories[0] === "all"
                  }
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => {
                    setSelectedCategories(checked ? ["all"] : []);
                  }}
                >
                  {t("participants.filter.all_categories")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {allSubCategories.map((category) => (
                  <DropdownMenuCheckboxItem
                    key={category}
                    checked={selectedCategories.includes(category)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) => {
                      setSelectedCategories((prev) => {
                        // Remove 'all' if it exists, as we are selecting specifics now
                        const newSelection = prev.filter((c) => c !== "all");

                        if (checked) {
                          return [...newSelection, category];
                        } else {
                          const afterRemoval = newSelection.filter(
                            (c) => c !== category
                          );
                          // If last specific category is removed, revert to 'all'
                          return afterRemoval.length === 0
                            ? ["all"]
                            : afterRemoval;
                        }
                      });
                    }}
                  >
                    {category}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sorting Filter */}
            <Select value={sortOption} onValueChange={setSortOption}>
              <SelectTrigger className="w-[240px]">
                <div className="flex items-center gap-2">
                  <ListFilter className="h-4 w-4" />
                  <SelectValue placeholder={t("participants.filter.sort_by")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="finalScore_desc">
                  {t("participants.filter.score_desc")}
                </SelectItem>
                <SelectItem value="finalScore_asc">
                  {t("participants.filter.score_asc")}
                </SelectItem>
                <SelectItem value="name_asc">
                  {t("participants.filter.name_asc")}
                </SelectItem>
                <SelectItem value="name_desc">
                  {t("participants.filter.name_desc")}
                </SelectItem>
                <SelectItem value="bonus_desc">
                  {t("participants.filter.bonus_desc")}
                </SelectItem>
                <SelectItem value="bonus_asc">
                  {t("participants.filter.bonus_asc")}
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Schedule Filter */}
            <Select
              value={selectedSchedule}
              onValueChange={setSelectedSchedule}
            >
              <SelectTrigger className="w-[200px]">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue
                    placeholder={t("participants.filter.by_schedule")}
                  />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("participants.filter.all_schedules")}
                </SelectItem>
                {availableSchedules.map((schedule) => (
                  <SelectItem key={schedule} value={schedule}>
                    {schedule}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Export Button */}
            <Button
              onClick={() => setIsExportDialogOpen(true)}
              disabled={processedParticipants.length === 0}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {t("participants.export.excel")}
            </Button>
          </div>

          <div className="relative w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("participants.searchPlaceholder")}
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <ParticipantsTable participants={processedParticipants} />
        </div>

        <ParticipantScoreVisualizations
          participants={searchFilteredParticipants}
        />
      </div>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => {
          setIsExportDialogOpen(false);
          setExportWithJuryFilter(false);
          setSelectedJuriesForExport([]);
        }}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">
              {t("participants.export.options")}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExportDialogOpen(false)}
            >
              ×
            </Button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <CheckboxItem
                checked={exportWithJuryFilter}
                onCheckedChange={setExportWithJuryFilter}
              >
                {t("participants.export.enableJuryFilter")}
              </CheckboxItem>
            </div>

            {exportWithJuryFilter && (
              <div className="space-y-3 pl-6 border-l-2 border-muted">
                <p className="text-sm text-muted-foreground">
                  {t("participants.export.juryFilterDescription")}
                </p>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableJuries.map((juryId) => (
                    <CheckboxItem
                      key={juryId}
                      checked={selectedJuriesForExport.includes(juryId)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedJuriesForExport((prev) => [
                            ...prev,
                            juryId,
                          ]);
                        } else {
                          setSelectedJuriesForExport((prev) =>
                            prev.filter((id) => id !== juryId)
                          );
                        }
                      }}
                    >
                      {juryIdToName.get(juryId) || `Jury ${juryId}`}
                    </CheckboxItem>
                  ))}
                </div>

                {selectedJuriesForExport.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {t("participants.export.selectedJuries", {
                      count: selectedJuriesForExport.length,
                      plural: selectedJuriesForExport.length !== 1 ? "s" : "",
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsExportDialogOpen(false)}
            >
              {t("participants.export.cancel")}
            </Button>
            <Button
              onClick={() => {
                handleExportToExcel();
                setIsExportDialogOpen(false);
              }}
              disabled={
                isExporting ||
                (exportWithJuryFilter && selectedJuriesForExport.length === 0)
              }
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting
                ? t("participants.export.exporting")
                : t("participants.export.export")}
            </Button>
          </div>
        </div>
      </ExportDialog>
    </div>
  );
}
