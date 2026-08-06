import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card";
import { Progress } from "@/components/shadcn/progress";
import { useMemo, useState } from "react";
import {
  Award,
  Star,
  Medal,
  Users,
  Zap,
  BookOpenCheck,
  Filter,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { useEvent } from "@/contexts/EventContext";
import { orderedEntries } from "@/evaluation/configHelpers";
import type { ParticipantWithScores } from "@/hooks/useParticipants";

interface ParticipantScoreVisualizationsProps {
  participants: ParticipantWithScores[];
}

/**
 * Config-driven leaderboard/statistics view (design doc §4, "Consumer
 * wiring"): every section shown here (retention bars, averages) is derived
 * from `config.questionTypes`/`participantAdjustments` and each
 * participant's `juryResults` (engine output) — never a hardcoded
 * hifdh/tajweed/waqf shape. Category filter chips enumerate
 * `config.categories` keys, not a hardcoded category table.
 */
export const ParticipantScoreVisualizations = ({
  participants,
}: ParticipantScoreVisualizationsProps) => {
  const { t } = useTranslation();
  const { evaluationConfig } = useEvent();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categoryIds = useMemo(
    () => (evaluationConfig ? Object.keys(evaluationConfig.categories).sort() : []),
    [evaluationConfig]
  );

  const filteredParticipants = useMemo(() => {
    if (categoryFilter === "all") return participants;
    return participants.filter((p) => p.category === categoryFilter);
  }, [participants, categoryFilter]);

  const participantsWithScores = useMemo(() => {
    return filteredParticipants
      .filter((p) => p.isDone && p.juryIds.length > 0 && p.finalScore >= 0)
      .sort((a, b) => b.finalScore - a.finalScore);
  }, [filteredParticipants]);

  // Average per-section impact across every ranking-eligible participant's
  // every jury's every question — a generic "how well did the field do in
  // section X" statistic.
  const sectionAverages = useMemo(() => {
    if (!evaluationConfig) return {} as Record<string, number>;
    const sectionIds = Object.keys(evaluationConfig.questionTypes);
    const totals: Record<string, number> = Object.fromEntries(sectionIds.map((id) => [id, 0]));
    let count = 0;
    for (const p of participantsWithScores) {
      for (const juryId of p.juryIds) {
        const result = p.juryResults[juryId];
        if (!result) continue;
        for (const q of result.questionResults) {
          for (const sectionId of sectionIds) {
            totals[sectionId] += q.sectionImpacts[sectionId] ?? 0;
          }
          count++;
        }
      }
    }
    const averages: Record<string, number> = {};
    for (const sectionId of sectionIds) {
      averages[sectionId] = count > 0 ? totals[sectionId] / count : 0;
    }
    return averages;
  }, [evaluationConfig, participantsWithScores]);

  const orderedSections = useMemo(
    () => (evaluationConfig ? orderedEntries(evaluationConfig.questionTypes) : []),
    [evaluationConfig]
  );

  const strongestSection = useMemo(() => {
    if (orderedSections.length === 0) return null;
    let best: { id: string; label: string; retention: number } | null = null;
    for (const [id, section] of orderedSections) {
      const cap = section.operation === "subtract" ? section.perSectionDeductionCap : section.perSectionAdditionCap;
      const impact = sectionAverages[id] ?? 0;
      const achieved = section.operation === "subtract" ? cap - impact : impact;
      const retention = cap > 0 ? (achieved / cap) * 100 : 100;
      if (!best || retention > best.retention) {
        best = { id, label: section.label.default, retention };
      }
    }
    return best;
  }, [orderedSections, sectionAverages]);

  const averageAdjustmentTotal = useMemo(() => {
    if (participantsWithScores.length === 0) return 0;
    const total = participantsWithScores.reduce((sum, p) => {
      const perJury = p.juryIds
        .map((id) => p.juryResults[id]?.signedAdjustmentTotal ?? 0)
        .reduce((s, v) => s + v, 0);
      return sum + (p.juryIds.length > 0 ? perJury / p.juryIds.length : 0);
    }, 0);
    return total / participantsWithScores.length;
  }, [participantsWithScores]);

  const scoreDistribution = useMemo(() => {
    return {
      excellent: participantsWithScores.filter((p) => p.finalScore >= 90).length,
      veryGood: participantsWithScores.filter((p) => p.finalScore >= 80 && p.finalScore < 90).length,
      good: participantsWithScores.filter((p) => p.finalScore >= 70 && p.finalScore < 80).length,
      average: participantsWithScores.filter((p) => p.finalScore >= 60 && p.finalScore < 70).length,
      belowAverage: participantsWithScores.filter((p) => p.finalScore < 60).length,
    };
  }, [participantsWithScores]);

  const hasParticipantsWithScores = participantsWithScores.length > 0;
  const topParticipants = participantsWithScores.slice(0, 5);

  const topBonusParticipants = useMemo(() => {
    return [...participantsWithScores]
      .map((p) => {
        const bonus =
          p.juryIds.length > 0
            ? p.juryIds.reduce((sum, id) => sum + (p.juryResults[id]?.signedAdjustmentTotal ?? 0), 0) /
              p.juryIds.length
            : 0;
        return { participant: p, bonus };
      })
      .filter(({ bonus }) => bonus > 0)
      .sort((a, b) => b.bonus - a.bonus)
      .slice(0, 5);
  }, [participantsWithScores]);

  const averageFinalScore = useMemo(() => {
    if (participantsWithScores.length === 0) return 0;
    return (
      participantsWithScores.reduce((sum, p) => sum + p.finalScore, 0) / participantsWithScores.length
    );
  }, [participantsWithScores]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">{t("participants.visualizations.title")}</h2>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("participants.filter.by_category")}</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <SelectValue placeholder={t("participants.filter.all_categories")} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("participants.filter.all_categories")}</SelectItem>
              {categoryIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasParticipantsWithScores ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-500" />
                  {t("participants.visualizations.topPerformers")}
                </CardTitle>
                <CardDescription>{t("participants.visualizations.topPerformersDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topParticipants.map((participant, i) => (
                    <div key={participant.id} className="flex items-center gap-3">
                      <div className="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1 gap-2">
                          <div className="truncate">
                            <span className="text-sm font-medium">{participant.name}</span>
                            <span className="ml-2 text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                              {participant.category}
                            </span>
                          </div>
                          <p className="text-sm font-bold flex-shrink-0">
                            {participant.finalScore.toFixed(2)} pts
                          </p>
                        </div>
                        <Progress value={participant.finalScore} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {topBonusParticipants.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-cyan-500" />
                    {t("participants.visualizations.topBonuses")}
                  </CardTitle>
                  <CardDescription>{t("participants.visualizations.topBonusesDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {topBonusParticipants.map(({ participant, bonus }, i) => (
                      <div key={participant.id} className="flex items-center gap-3">
                        <div className="flex-none w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1 gap-2">
                            <div className="truncate">
                              <span className="text-sm font-medium">{participant.name}</span>
                              <span className="ml-2 text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                                {participant.category}
                              </span>
                            </div>
                            <p className="text-sm font-bold flex-shrink-0">+{bonus.toFixed(1)} pts</p>
                          </div>
                          <Progress value={Math.min(100, (bonus / 5) * 100)} className="h-2 [&>*]:bg-cyan-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <BookOpenCheck className="h-5 w-5 text-blue-500" />
                  {t("participants.visualizations.categoryPerformance")}
                </CardTitle>
                <CardDescription>{t("participants.visualizations.categoryPerformanceDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {orderedSections.map(([sectionId, section]) => {
                    const cap =
                      section.operation === "subtract" ? section.perSectionDeductionCap : section.perSectionAdditionCap;
                    const impact = sectionAverages[sectionId] ?? 0;
                    const achieved = section.operation === "subtract" ? cap - impact : impact;
                    const retention = cap > 0 ? (achieved / cap) * 100 : 100;
                    return (
                      <div key={sectionId}>
                        <div className="flex justify-between items-baseline mb-1">
                          <p className="text-sm font-medium">{section.label.default}</p>
                          <p className="text-sm font-bold">{retention.toFixed(1)}%</p>
                        </div>
                        <Progress value={retention} className="h-2" />
                      </div>
                    );
                  })}
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-baseline">
                      <p className="text-sm font-medium text-green-600">
                        {t("participants.visualizations.avgBonus")}
                      </p>
                      <p className="text-sm font-bold text-green-600">
                        {averageAdjustmentTotal >= 0 ? "+" : ""}
                        {averageAdjustmentTotal.toFixed(1)} pts
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Medal className="h-5 w-5 text-indigo-500" />
                  {t("participants.visualizations.scoreDistribution")}
                </CardTitle>
                <CardDescription>{t("participants.visualizations.scoreDistributionDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(
                    [
                      ["excellent", t("participants.visualizations.excellent") + " (90-100%)", "bg-emerald-100"],
                      ["veryGood", t("participants.visualizations.veryGood") + " (80-89%)", "bg-blue-100"],
                      ["good", t("participants.visualizations.good") + " (70-79%)", "bg-sky-100"],
                      ["average", t("participants.visualizations.average") + " (60-69%)", "bg-orange-100"],
                      ["belowAverage", t("participants.visualizations.belowAverage") + " (<60%)", "bg-red-100"],
                    ] as const
                  ).map(([key, label, barClass]) => (
                    <div key={key}>
                      <div className="flex justify-between items-baseline mb-1">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-sm font-bold">{scoreDistribution[key]}</p>
                      </div>
                      <Progress
                        value={(scoreDistribution[key] / participantsWithScores.length) * 100}
                        className={`h-2 ${barClass}`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("participants.visualizations.averageScore")}
                    </p>
                    <p className="text-3xl font-bold mt-1">{averageFinalScore.toFixed(1)}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Star className="h-6 w-6 text-blue-500 dark:text-blue-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("participants.visualizations.highestScore")}
                    </p>
                    <p className="text-3xl font-bold mt-1">
                      {participantsWithScores[0]?.finalScore.toFixed(1)} pts
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-emerald-500 dark:text-emerald-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("participants.visualizations.evaluatedParticipants")}
                    </p>
                    <p className="text-3xl font-bold mt-1">{participantsWithScores.length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <Users className="h-6 w-6 text-purple-500 dark:text-purple-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {strongestSection && (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("participants.visualizations.strongestCategory")}
                      </p>
                      <p className="text-3xl font-bold mt-1">{strongestSection.label}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {strongestSection.retention.toFixed(1)}% {t("participants.visualizations.retentionRate")}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                      <BookOpenCheck className="h-6 w-6 text-amber-500 dark:text-amber-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {t("participants.visualizations.noParticipantsFound")}
              </h3>
              <p className="text-muted-foreground">
                {categoryFilter === "all"
                  ? t("participants.visualizations.noParticipantsWithScores")
                  : t("participants.visualizations.noParticipantsInCategory", { category: categoryFilter })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
