import { createLazyFileRoute } from "@tanstack/react-router";
import { ParticipantsTable } from "@/components/ui/ParticipantsTable";
import { ParticipantScoreVisualizations } from "@/components/ui/ParticipantScoreVisualizations";
import { EvaluationConfigGate } from "@/components/EvaluationConfigGate";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Input } from "@/components/shadcn/input";
import { Search, Filter, ListFilter, Download } from "lucide-react";
import { useState } from "react";
import {
  useParticipants,
  useParticipantsListenerError,
  ParticipantWithScores,
} from "@/hooks/useParticipants";
import { useJuryMembers } from "@/hooks/useJuryMembers";
import { useEvent } from "@/contexts/EventContext";
import { orderedEntries } from "@/evaluation/configHelpers";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";
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
import * as XLSX from "xlsx";

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

export const Route = createLazyFileRoute("/participants")({
  component: RouteComponent,
});

/**
 * Builds one flat row of section-average deductions/additions for a
 * participant (across the jury results actually counted toward
 * `finalScore`), keyed by the config's own section ids — used by both the
 * Detailed Scores sheet and the Statistics sheet so the export never
 * hardcodes a hifdh/tajweed/waqf column set.
 */
function averageSectionImpacts(
  config: EventEvaluationConfigV2,
  participant: ParticipantWithScores
): Record<string, number> {
  const sectionIds = Object.keys(config.questionTypes);
  const totals: Record<string, number> = Object.fromEntries(sectionIds.map((id) => [id, 0]));
  let count = 0;
  for (const juryId of participant.juryIds) {
    const result = participant.juryResults[juryId];
    if (!result) continue;
    for (const q of result.questionResults) {
      for (const sectionId of sectionIds) {
        totals[sectionId] += q.sectionImpacts[sectionId] ?? 0;
      }
      count++;
    }
  }
  const averages: Record<string, number> = {};
  for (const sectionId of sectionIds) {
    averages[sectionId] = count > 0 ? totals[sectionId] / count : 0;
  }
  return averages;
}

function averageAdjustmentTotal(participant: ParticipantWithScores): number {
  if (participant.juryIds.length === 0) return 0;
  const total = participant.juryIds.reduce(
    (sum, id) => sum + (participant.juryResults[id]?.signedAdjustmentTotal ?? 0),
    0
  );
  return total / participant.juryIds.length;
}

function RouteComponent() {
  return (
    <EvaluationConfigGate>
      <ParticipantsRoute />
    </EvaluationConfigGate>
  );
}

function ParticipantsRoute() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: participants = [], isLoading } = useParticipants();
  const listenerError = useParticipantsListenerError();
  const { data: juryMembers = [] } = useJuryMembers();
  const { evaluationConfig } = useEvent();
  const { t } = useTranslation();

  const allCategories = useMemo(
    () => (evaluationConfig ? Object.keys(evaluationConfig.categories).sort() : []),
    [evaluationConfig]
  );

  const [selectedCategories, setSelectedCategories] = useState<string[]>(["all"]);
  const [sortOption, setSortOption] = useState("finalScore_desc");
  const [selectedSchedule, setSelectedSchedule] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedJuriesForExport, setSelectedJuriesForExport] = useState<string[]>([]);
  const [exportWithJuryFilter, setExportWithJuryFilter] = useState(false);

  const searchFilteredParticipants = useMemo(
    () =>
      participants.filter((participant) =>
        participant.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [participants, searchQuery]
  );

  const availableSchedules = useMemo(() => {
    const schedules = new Set<string>();
    participants.forEach((p) => {
      schedules.add(p.scheduled || "Unscheduled");
    });
    return Array.from(schedules).sort((a, b) => {
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [participants]);

  const availableJuries = useMemo(() => {
    const allJuryIds = new Set<string>();
    participants.forEach((p) => p.juryIds.forEach((id) => allJuryIds.add(id)));
    return Array.from(allJuryIds).sort();
  }, [participants]);

  const juryIdToName = useMemo(() => {
    const mapping = new Map<string, string>();
    juryMembers.forEach((jury) => mapping.set(jury.id, jury.name || `Jury ${jury.id}`));
    return mapping;
  }, [juryMembers]);

  // If jury filtering is enabled for export, only include participants that
  // have a complete evaluation from every selected jury; recompute
  // finalScore from just those juries so the export never disagrees with
  // what it's actually reporting on.
  const filterParticipantForExport = (
    participant: ParticipantWithScores,
    selectedJuries: string[]
  ): ParticipantWithScores => {
    if (!exportWithJuryFilter || selectedJuries.length === 0) return participant;

    const hasAll = selectedJuries.every((id) => participant.juryResults[id]);
    if (!hasAll) {
      return { ...participant, finalScore: -1, juryResults: {}, juryIds: [] };
    }

    const juryResults = Object.fromEntries(
      selectedJuries.map((id) => [id, participant.juryResults[id]])
    );
    const finals = selectedJuries.map((id) => participant.juryResults[id].juryFinal);
    const finalScore = finals.reduce((s, v) => s + v, 0) / finals.length;

    return { ...participant, juryResults, juryIds: [...selectedJuries].sort(), finalScore };
  };

  const processedParticipants = useMemo(() => {
    const isAllSelected = selectedCategories.length === 1 && selectedCategories[0] === "all";
    const activeCategories = isAllSelected ? allCategories : selectedCategories;

    let categoryFiltered =
      activeCategories.length > 0
        ? searchFilteredParticipants.filter((p) => activeCategories.includes(p.category))
        : [];

    if (selectedSchedule !== "all") {
      categoryFiltered = categoryFiltered.filter(
        (p) => (p.scheduled || "Unscheduled") === selectedSchedule
      );
    }

    return categoryFiltered.slice().sort((a, b) => {
      const [sortKey, sortOrder] = sortOption.split("_");
      const direction = sortOrder === "asc" ? 1 : -1;

      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * direction;
        case "bonus":
          return (averageAdjustmentTotal(a) - averageAdjustmentTotal(b)) * direction;
        case "finalScore":
        default:
          if (a.finalScore === -1 && b.finalScore > -1) return 1;
          if (b.finalScore === -1 && a.finalScore > -1) return -1;
          return (a.finalScore - b.finalScore) * direction;
      }
    });
  }, [searchFilteredParticipants, selectedCategories, sortOption, selectedSchedule, allCategories]);

  const handleExportToExcel = async () => {
    if (!evaluationConfig) return;
    setIsExporting(true);

    try {
      const workbook = XLSX.utils.book_new();

      const participantsForExport =
        exportWithJuryFilter && selectedJuriesForExport.length > 0
          ? processedParticipants.map((p) => filterParticipantForExport(p, selectedJuriesForExport))
          : processedParticipants;

      const sortedParticipants = participantsForExport.slice().sort((a, b) => {
        if (a.finalScore === -1 && b.finalScore > -1) return 1;
        if (b.finalScore === -1 && a.finalScore > -1) return -1;
        return b.finalScore - a.finalScore;
      });

      // 1. Summary Sheet
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
          participant.finalScore > 0 ? `${participant.finalScore.toFixed(2)} pts` : "-",
        "Jury Count": participant.juryIds.length,
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), "Summary");

      // 2. Detailed Scores Sheet — one column per config section, never
      // hardcoded to hifdh/tajweed/waqf.
      const orderedSections = orderedEntries(evaluationConfig.questionTypes);
      const orderedAdjustments = orderedEntries(evaluationConfig.participantAdjustments);
      const detailedData = sortedParticipants
        .filter((p) => p.finalScore > 0)
        .map((participant, index) => {
          const impacts = averageSectionImpacts(evaluationConfig, participant);
          const row: Record<string, string | number> = {
            Rank: index + 1,
            Name: participant.name,
            Category: participant.category,
            "Final Score": `${participant.finalScore.toFixed(2)} pts`,
          };
          for (const [sectionId, section] of orderedSections) {
            const cap =
              section.operation === "subtract" ? section.perSectionDeductionCap : section.perSectionAdditionCap;
            const impact = impacts[sectionId] ?? 0;
            const achieved = section.operation === "subtract" ? cap - impact : impact;
            row[`${section.label.default} Score`] = `${achieved.toFixed(2)}/${cap}`;
            row[`${section.label.default} %`] = `${cap > 0 ? ((achieved / cap) * 100).toFixed(2) : "100.00"}%`;
          }
          for (const [, adjustment] of orderedAdjustments) {
            row[adjustment.label.default] = `${averageAdjustmentTotal(participant).toFixed(2)} pts`;
          }
          row["Jury Count"] = participant.juryIds.length;
          return row;
        });
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailedData), "Detailed Scores");

      // 3. Individual Jury Sheets
      const allJuryIds =
        exportWithJuryFilter && selectedJuriesForExport.length > 0
          ? new Set(selectedJuriesForExport)
          : new Set<string>();
      if (!exportWithJuryFilter || selectedJuriesForExport.length === 0) {
        sortedParticipants.forEach((p) => p.juryIds.forEach((id) => allJuryIds.add(id)));
      }

      Array.from(allJuryIds)
        .sort()
        .forEach((juryId) => {
          const juryName = juryIdToName.get(juryId) || `Jury ${juryId}`;
          const juryData: Record<string, string | number>[] = [];

          sortedParticipants
            .filter((p) => p.juryResults[juryId])
            .forEach((participant) => {
              const result = participant.juryResults[juryId];

              const headerRow: Record<string, string | number> = {
                Participant: participant.name,
                Category: participant.category,
                Judge: juryName,
                Question: "",
                "Overall Adjustment": result.signedAdjustmentTotal.toFixed(2),
                "Final Score": `${result.juryFinal.toFixed(2)} pts`,
              };
              juryData.push(headerRow);

              result.questionResults.forEach((q, qIndex) => {
                const row: Record<string, string | number> = {
                  Participant: "",
                  Category: "",
                  Judge: "",
                  Question: `Q${qIndex + 1}`,
                  "Overall Adjustment": "",
                  "Final Score": `${q.score.toFixed(2)} pts`,
                };
                for (const [sectionId, section] of orderedSections) {
                  row[section.label.default] = q.sectionImpacts[sectionId]?.toFixed(2) ?? "0.00";
                }
                juryData.push(row);
              });

              juryData.push({});
            });

          if (juryData.length > 0) {
            const sheetName = juryName.substring(0, 31);
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(juryData), sheetName);
          }
        });

      // 4. Statistics Sheet
      const evaluatedParticipants = sortedParticipants.filter((p) => p.finalScore > 0);
      const statsData: { Metric: string; Value: string | number }[] = [];

      if (evaluatedParticipants.length > 0) {
        const avgFinalScore =
          evaluatedParticipants.reduce((sum, p) => sum + p.finalScore, 0) / evaluatedParticipants.length;

        statsData.push(
          { Metric: "Total Participants", Value: sortedParticipants.length },
          { Metric: "Evaluated Participants", Value: evaluatedParticipants.length },
          { Metric: "Pending Participants", Value: sortedParticipants.length - evaluatedParticipants.length },
          { Metric: "Active Jury Members", Value: allJuryIds.size },
          { Metric: "Jury Filtering Applied", Value: exportWithJuryFilter ? "Yes" : "No" },
          { Metric: "", Value: "" },
          { Metric: "Average Final Score", Value: `${avgFinalScore.toFixed(2)} pts` },
          { Metric: "Highest Score", Value: `${evaluatedParticipants[0]?.finalScore.toFixed(2)} pts` },
          {
            Metric: "Lowest Score",
            Value: `${evaluatedParticipants[evaluatedParticipants.length - 1]?.finalScore.toFixed(2)} pts`,
          },
          { Metric: "", Value: "" },
          { Metric: "Jury Members:", Value: "" }
        );

        Array.from(allJuryIds)
          .sort()
          .forEach((juryId) => {
            statsData.push({ Metric: `- ${juryIdToName.get(juryId) || juryId}`, Value: juryId });
          });
      } else {
        statsData.push({ Metric: "No evaluated participants found", Value: "" });
      }
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(statsData), "Statistics");

      const selectedCategoryNames = selectedCategories.includes("all")
        ? "All-Categories"
        : selectedCategories.join("-");
      const juryFilterSuffix =
        exportWithJuryFilter && selectedJuriesForExport.length > 0
          ? `-Jury-Filtered-${selectedJuriesForExport.length}`
          : "";
      const currentDate = new Date().toISOString().split("T")[0];
      XLSX.writeFile(
        workbook,
        `Participants-Export-${selectedCategoryNames}${juryFilterSuffix}-${currentDate}.xlsx`
      );
    } catch (error) {
      console.error("Error exporting to Excel:", error);
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
        {listenerError && (
          <div
            role="alert"
            data-testid="participants-listener-error"
            className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/40 p-4 text-red-800 dark:text-red-200"
          >
            {t(
              "participants.listenerError",
              "Live updates disconnected — scores may be out of date. Please reload the page."
            )}
          </div>
        )}

        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">{t("participants.header.title")}</h1>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>{t("participants.filter.by_category")}</span>
                  {selectedCategories.length > 0 && !selectedCategories.includes("all") && (
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
                <DropdownMenuLabel>{t("participants.filter.select_categories")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  key="all"
                  checked={selectedCategories.length === 1 && selectedCategories[0] === "all"}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => setSelectedCategories(checked ? ["all"] : [])}
                >
                  {t("participants.filter.all_categories")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {allCategories.map((category) => (
                  <DropdownMenuCheckboxItem
                    key={category}
                    checked={selectedCategories.includes(category)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) => {
                      setSelectedCategories((prev) => {
                        const newSelection = prev.filter((c) => c !== "all");
                        if (checked) return [...newSelection, category];
                        const afterRemoval = newSelection.filter((c) => c !== category);
                        return afterRemoval.length === 0 ? ["all"] : afterRemoval;
                      });
                    }}
                  >
                    {category}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select value={sortOption} onValueChange={setSortOption}>
              <SelectTrigger className="w-[240px]">
                <div className="flex items-center gap-2">
                  <ListFilter className="h-4 w-4" />
                  <SelectValue placeholder={t("participants.filter.sort_by")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="finalScore_desc">{t("participants.filter.score_desc")}</SelectItem>
                <SelectItem value="finalScore_asc">{t("participants.filter.score_asc")}</SelectItem>
                <SelectItem value="name_asc">{t("participants.filter.name_asc")}</SelectItem>
                <SelectItem value="name_desc">{t("participants.filter.name_desc")}</SelectItem>
                <SelectItem value="bonus_desc">{t("participants.filter.bonus_desc")}</SelectItem>
                <SelectItem value="bonus_asc">{t("participants.filter.bonus_asc")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
              <SelectTrigger className="w-[200px]">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue placeholder={t("participants.filter.by_schedule")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("participants.filter.all_schedules")}</SelectItem>
                {availableSchedules.map((schedule) => (
                  <SelectItem key={schedule} value={schedule}>
                    {schedule}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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

        <ParticipantScoreVisualizations participants={searchFilteredParticipants} />
      </div>

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
            <h2 className="text-xl font-semibold">{t("participants.export.options")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setIsExportDialogOpen(false)}>
              ×
            </Button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <CheckboxItem checked={exportWithJuryFilter} onCheckedChange={setExportWithJuryFilter}>
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
                          setSelectedJuriesForExport((prev) => [...prev, juryId]);
                        } else {
                          setSelectedJuriesForExport((prev) => prev.filter((id) => id !== juryId));
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
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
              {t("participants.export.cancel")}
            </Button>
            <Button
              onClick={() => {
                handleExportToExcel();
                setIsExportDialogOpen(false);
              }}
              disabled={isExporting || (exportWithJuryFilter && selectedJuriesForExport.length === 0)}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? t("participants.export.exporting") : t("participants.export.export")}
            </Button>
          </div>
        </div>
      </ExportDialog>
    </div>
  );
}
