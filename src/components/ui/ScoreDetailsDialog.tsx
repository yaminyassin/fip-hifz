import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { X, CheckCircle2, BarChart3, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/shadcn/select";
import { useJuryMembers } from "@/hooks/useJuryMembers";
import { useEvent } from "@/contexts/EventContext";
import { orderedEntries, ruleIsVoid } from "@/evaluation/configHelpers";
import type { JuryScoreResult } from "@/evaluation/scoringEngine";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";
import type { ParticipantWithScores } from "@/hooks/useParticipants";

interface ScoreDetailsDialogProps {
  participant: ParticipantWithScores;
  isOpen: boolean;
  onClose: () => void;
}

const DialogRoot = ({
  children,
  open,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto p-6"
        data-testid="score-details-dialog"
      >
        {children}
      </div>
    </div>
  );
};

interface PerQuestionRow {
  questionNumber: number;
  score: number;
  sectionImpacts: Record<string, number>;
  voided: boolean;
}

interface Aggregate {
  juryFinal: number;
  signedAdjustmentTotal: number;
  perSectionAverage: Record<string, number>;
  perQuestion: PerQuestionRow[];
}

/** Averages one or more `JuryScoreResult`s (a single jury's exact result, or
 * every jury's results for an "average of all" view) into one display-ready
 * shape — no hardcoded section names, purely driven by whatever sections
 * exist in each result's `sectionImpacts`. */
function aggregateResults(
  config: EventEvaluationConfigV2,
  results: readonly JuryScoreResult[]
): Aggregate | null {
  if (results.length === 0) return null;

  const juryFinal = results.reduce((sum, r) => sum + r.juryFinal, 0) / results.length;
  const signedAdjustmentTotal =
    results.reduce((sum, r) => sum + r.signedAdjustmentTotal, 0) / results.length;

  const sectionIds = Object.keys(results[0].questionResults[0]?.sectionImpacts ?? {});
  const perSectionAverage: Record<string, number> = {};
  for (const sectionId of sectionIds) {
    let total = 0;
    let count = 0;
    for (const result of results) {
      for (const q of result.questionResults) {
        total += q.sectionImpacts[sectionId] ?? 0;
        count++;
      }
    }
    perSectionAverage[sectionId] = count > 0 ? total / count : 0;
  }

  const questionCount = results[0].questionResults.length;
  const perQuestion: PerQuestionRow[] = [];
  for (let i = 0; i < questionCount; i++) {
    let scoreTotal = 0;
    const sectionTotals: Record<string, number> = {};
    let allVoided = true;
    for (const result of results) {
      const q = result.questionResults[i];
      if (!q) continue;
      scoreTotal += q.score;
      for (const sectionId of sectionIds) {
        sectionTotals[sectionId] = (sectionTotals[sectionId] ?? 0) + (q.sectionImpacts[sectionId] ?? 0);
      }
      if (!ruleIsVoid(config, q.terminalRuleId)) allVoided = false;
    }
    const sectionImpacts: Record<string, number> = {};
    for (const sectionId of sectionIds) {
      sectionImpacts[sectionId] = sectionTotals[sectionId] / results.length;
    }
    perQuestion.push({
      questionNumber: i + 1,
      score: scoreTotal / results.length,
      sectionImpacts,
      voided: allVoided,
    });
  }

  return { juryFinal, signedAdjustmentTotal, perSectionAverage, perQuestion };
}

function getScoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 80) return "text-blue-600";
  if (score >= 70) return "text-yellow-600";
  if (score >= 60) return "text-orange-600";
  return "text-red-600";
}

export const ScoreDetailsDialog = ({
  participant,
  isOpen,
  onClose,
}: ScoreDetailsDialogProps) => {
  const { t } = useTranslation();
  const { evaluationConfig } = useEvent();
  const { data: juryMembers = [] } = useJuryMembers();
  const [selectedJuryId, setSelectedJuryId] = useState<string>("average");
  const [activeTab, setActiveTab] = useState<"overview" | "per-question">("overview");

  const juryIds = useMemo(() => participant.juryIds ?? [], [participant.juryIds]);

  const selectedResults = useMemo(() => {
    if (selectedJuryId === "average") {
      return juryIds.map((id) => participant.juryResults[id]).filter(Boolean);
    }
    const single = participant.juryResults[selectedJuryId];
    return single ? [single] : [];
  }, [selectedJuryId, juryIds, participant.juryResults]);

  const aggregate = useMemo(
    () => (evaluationConfig ? aggregateResults(evaluationConfig, selectedResults) : null),
    [evaluationConfig, selectedResults]
  );

  const juryName =
    selectedJuryId === "average"
      ? t("jury.scoreSummary.averageOfAll")
      : juryMembers.find((j) => j.id === selectedJuryId)?.name ??
        t("jury.scoreSummary.juryMember", { id: selectedJuryId });

  if (!evaluationConfig || !aggregate) {
    return (
      <DialogRoot open={isOpen} onOpenChange={onClose}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {t("participants.visualizations.title")} - {participant.name}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("actions.close")}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <p>{t("messages.noData")}</p>
      </DialogRoot>
    );
  }

  const orderedSections = orderedEntries(evaluationConfig.questionTypes);
  const orderedAdjustments = orderedEntries(evaluationConfig.participantAdjustments);

  const renderOverviewTab = () => (
    <>
      <Card className="mb-6 shadow-lg">
        <CardHeader className="text-center">
          <CardDescription>{t("jury.scoreSummary.totalScore")}</CardDescription>
          <CardTitle className={`text-5xl font-extrabold ${getScoreColor(aggregate.juryFinal)}`}>
            {aggregate.juryFinal.toFixed(2)} pts
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {orderedSections.map(([sectionId, section]) => {
          const cap = section.operation === "subtract" ? section.perSectionDeductionCap : section.perSectionAdditionCap;
          const impact = aggregate.perSectionAverage[sectionId] ?? 0;
          const achieved = section.operation === "subtract" ? cap - impact : impact;
          const isPerfect = section.operation === "subtract" ? impact <= 0 : impact >= cap;
          return (
            <Card key={sectionId} className="h-auto">
              <CardHeader>
                <CardTitle>{section.label.default}</CardTitle>
                <CardDescription>
                  {section.operation === "subtract"
                    ? `Achieved: ${achieved.toFixed(1)} / ${cap} pts`
                    : `Bonus: +${impact.toFixed(1)} / ${cap} pts`}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                {isPerfect ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {t("jury.categories.perfectPerformance")}
                    </span>
                  </div>
                ) : (
                  <span className={`text-3xl font-bold ${getScoreColor(cap > 0 ? (achieved / cap) * 100 : 100)}`}>
                    {achieved.toFixed(1)} pts
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {orderedAdjustments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {orderedAdjustments.map(([adjustmentId, adjustment]) => (
            <Card key={adjustmentId} className="h-auto">
              <CardHeader>
                <CardTitle>{adjustment.label.default}</CardTitle>
                <CardDescription>
                  {adjustment.operation === "add"
                    ? `Max +${adjustment.additionCap} pts`
                    : `Max ${adjustment.deductionCap} pts deduction`}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                {aggregate.signedAdjustmentTotal !== 0 ? (
                  <span
                    className={`text-3xl font-bold ${aggregate.signedAdjustmentTotal > 0 ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"}`}
                  >
                    {aggregate.signedAdjustmentTotal > 0 ? "+" : ""}
                    {aggregate.signedAdjustmentTotal.toFixed(1)} pts
                  </span>
                ) : (
                  <span className="text-muted-foreground text-lg">
                    {t("status.noBonusAwarded")}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h3 className="text-xl font-semibold mb-3">{t("jury.questionBreakdown")}</h3>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="p-3 text-left font-medium">{t("jury.question")}</th>
                  {orderedSections.map(([sectionId, section]) => (
                    <th key={sectionId} className="p-3 text-center font-medium whitespace-nowrap">
                      {section.label.default}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aggregate.perQuestion.map((row) => (
                  <tr
                    key={row.questionNumber}
                    className={`border-b last:border-none ${row.voided ? "bg-red-50 dark:bg-red-900/30" : ""}`}
                  >
                    <td className="p-3 font-medium">
                      {t("jury.question")} {row.questionNumber}
                      {row.voided && (
                        <span className="ml-2 text-xs text-red-600 dark:text-red-400 font-semibold">
                          ({t("status.voided")})
                        </span>
                      )}
                    </td>
                    {orderedSections.map(([sectionId]) => (
                      <td key={sectionId} className="p-3 text-center">
                        {row.sectionImpacts[sectionId]?.toFixed(1) ?? "0.0"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );

  const renderPerQuestionTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {aggregate.perQuestion.map((row) => (
        <Card
          key={row.questionNumber}
          className={row.voided ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-border"}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              {t("jury.question")} {row.questionNumber}
              <span className={`text-2xl font-bold ${getScoreColor(row.score)}`}>
                {row.score.toFixed(1)} pts
              </span>
            </CardTitle>
            {row.voided && (
              <CardDescription className="text-red-600 dark:text-red-400 font-semibold">
                {t("status.voided")}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {orderedSections.map(([sectionId, section]) => {
              const impact = row.sectionImpacts[sectionId] ?? 0;
              if (impact === 0) return null;
              return (
                <div key={sectionId} className="flex justify-between text-xs">
                  <span>{section.label.default}:</span>
                  <span className={section.operation === "subtract" ? "text-red-600" : "text-green-600"}>
                    {section.operation === "subtract" ? "-" : "+"}
                    {impact.toFixed(1)} pts
                  </span>
                </div>
              );
            })}
            {orderedSections.every(([sectionId]) => (row.sectionImpacts[sectionId] ?? 0) === 0) &&
              !row.voided && (
                <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">{t("jury.categories.perfectPerformance")}</span>
                </div>
              )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{participant.name}</h2>
          <p className="text-sm text-muted-foreground">
            {t("participants.visualizations.title")} - {juryName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedJuryId} onValueChange={setSelectedJuryId}>
            <SelectTrigger className="w-[200px]" aria-label={t("filter.byJury")}>
              <SelectValue placeholder={t("filter.selectJury")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="average">{t("jury.scoreSummary.averageOfAll")}</SelectItem>
              {juryIds.map((id) => {
                const jury = juryMembers.find((j) => j.id === id);
                return (
                  <SelectItem key={id} value={id}>
                    {jury?.name || t("jury.scoreSummary.juryMember", { id })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("actions.close")}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex space-x-1 rounded-lg bg-muted p-1 mb-6">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
            activeTab === "overview"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          {t("tabs.overview")}
        </button>
        <button
          onClick={() => setActiveTab("per-question")}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
            activeTab === "per-question"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          {t("tabs.perQuestion")}
        </button>
      </div>

      {activeTab === "overview" && renderOverviewTab()}
      {activeTab === "per-question" && renderPerQuestionTab()}
    </DialogRoot>
  );
};
