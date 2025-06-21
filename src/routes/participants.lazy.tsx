import { createLazyFileRoute } from "@tanstack/react-router";
import { ParticipantsTable } from "@/components/ui/ParticipantsTable";
import { ParticipantScoreVisualizations } from "@/components/ui/ParticipantScoreVisualizations";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Input } from "@/components/shadcn/input";
import { Search, Filter, ListFilter } from "lucide-react";
import { useState } from "react";
import { useParticipants } from "@/hooks/useParticipants";
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
import { calculateFinalScore } from "@/utils/scoreUtils";
import {
  fillMissingQuestionsAndCalculateAverage,
  categoryConfigs,
} from "@/lib/quranUtils";

export const Route = createLazyFileRoute("/participants")({
  component: RouteComponent,
});

function RouteComponent() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: participants = [], isLoading } = useParticipants();
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

  const searchFilteredParticipants = useMemo(
    () =>
      participants.filter((participant) =>
        participant.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [participants, searchQuery]
  );

  const processedParticipants = useMemo(() => {
    // Determine which categories to use for filtering
    const isAllSelected =
      selectedCategories.length === 1 && selectedCategories[0] === "all";
    const activeCategories = isAllSelected ? nonMCategories : selectedCategories;

    // 1. Filter by category
    const categoryFiltered =
      activeCategories.length > 0
        ? searchFilteredParticipants.filter((participant) =>
          activeCategories.includes(participant.category)
        )
        : []; // If no categories are selected, show no participants

    // 2. Calculate scores for sorting
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

    // 3. Sort
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
  }, [searchFilteredParticipants, selectedCategories, sortOption]);

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
          <div className="flex items-center gap-2">
            {/* Category Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>{t("participants.filter.by_category")}</span>
                  {selectedCategories.length > 0 && (
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
                  {t("participants.filter.score_desc", "Score: High to Low")}
                </SelectItem>
                <SelectItem value="finalScore_asc">
                  {t("participants.filter.score_asc", "Score: Low to High")}
                </SelectItem>
                <SelectItem value="name_asc">
                  {t("participants.filter.name_asc", "Name: A-Z")}
                </SelectItem>
                <SelectItem value="name_desc">
                  {t("participants.filter.name_desc", "Name: Z-A")}
                </SelectItem>
                <SelectItem value="bonus_desc">
                  {t("participants.filter.bonus_desc", "Bonus: High to Low")}
                </SelectItem>
                <SelectItem value="bonus_asc">
                  {t("participants.filter.bonus_asc", "Bonus: Low to High")}
                </SelectItem>
              </SelectContent>
            </Select>
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
    </div>
  );
}
