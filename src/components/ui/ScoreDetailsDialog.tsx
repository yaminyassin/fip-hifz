import { Participant, QuestionFields } from "@/models/models";
import { useTranslation } from "react-i18next";
import { calculateFinalScore, CalculatedScoreResult, MAX_HIFDH_DEDUCTION, MAX_TAJWEED_DEDUCTION, MAX_WAQF_IBTIDA_DEDUCTION, getSectionWeight } from "@/utils/scoreUtils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/shadcn/select";
import { useJuryMembers } from "@/hooks/useJuryMembers";

// Create our own dialog components since they don't exist in the project
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
      <div className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto p-6">
        {children}
      </div>
    </div>
  );
};

// Updated to include the new score format
type ParticipantWithScores = Participant & {
  questionScores?: {
    byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
    average: { [questionNumber: number]: QuestionFields };
    juryIds: string[];
  };
  overallAverageScore?: CalculatedScoreResult;
  scoresByJury?: Record<string, CalculatedScoreResult>;
};

interface ScoreDetailsDialogProps {
  participant: ParticipantWithScores;
  isOpen: boolean;
  onClose: () => void;
}

export const ScoreDetailsDialog = ({
  participant,
  isOpen,
  onClose,
}: ScoreDetailsDialogProps) => {
  const { t } = useTranslation();
  const [selectedJuryId, setSelectedJuryId] = useState<string>("average");
  const [activeQuestionDetailScores, setActiveQuestionDetailScores] = useState<{
    [questionNumber: number]: QuestionFields;
  }>({});
  const [displayedResult, setDisplayedResult] = useState<CalculatedScoreResult | null>(null);
  const [juryName, setJuryName] = useState<string>("");
  const { data: juryMembers = [] } = useJuryMembers();

  useEffect(() => {
    if (!participant.questionScores) {
      setDisplayedResult(null);
      setActiveQuestionDetailScores({});
      return;
    }

    let scoresToCalculate: { [questionNumber: number]: QuestionFields } | null = null;

    if (selectedJuryId === "average") {
      scoresToCalculate = participant.questionScores.average;
      setJuryName(t("jury.scoreSummary.averageOfAll"));
    } else {
      scoresToCalculate = participant.questionScores.byJury?.[selectedJuryId] || {};
      const juryMember = juryMembers.find((jury) => jury.id === selectedJuryId);
      setJuryName(juryMember?.name || t("jury.scoreSummary.juryMember", { id: selectedJuryId }));
    }

    if (scoresToCalculate && Object.keys(scoresToCalculate).length > 0) {
      setDisplayedResult(calculateFinalScore(scoresToCalculate as any));
      setActiveQuestionDetailScores(scoresToCalculate);
    } else {
      setDisplayedResult(null);
      setActiveQuestionDetailScores({});
    }

  }, [selectedJuryId, participant.questionScores, juryMembers, t]);

  if (!participant.questionScores || !displayedResult) {
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

  const questionNumbers = Object.keys(activeQuestionDetailScores).map(Number).sort((a, b) => a - b);
  const { percentage: finalPercentage, breakdownBySection } = displayedResult;

  const getCategoryName = (key: keyof QuestionFields) => {
    const categories: Record<keyof QuestionFields, string> = {
      hifdh_judge_correction: t("jury.categories.hifdh_judge_correction"),
      hifdh_self_correction: t("jury.categories.hifdh_self_correction"),
      hifdh_stuck_count: t("jury.categories.hifdh_stuck_count"),
      tajweed_major: t("jury.categories.tajweed_major"),
      tajweed_minor: t("jury.categories.tajweed_minor"),
      waqf_ibtida_incorrect: t("jury.categories.waqf_ibtida_incorrect"),
      waqf_ibtida_meaning: t("jury.categories.waqf_ibtida_meaning"),
      husn_al_ada_score: t("jury.categories.husn_al_ada_mistakes_count"),
      overall_bonus: t("jury.categories.overall_bonus"),
    };
    return categories[key] || key;
  };
  
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 80) return "text-blue-600";
    if (score >= 70) return "text-yellow-600";
    if (score >= 60) return "text-orange-600";
    return "text-red-600";
  };

  const renderCategoryCards = () => {
    return (
        <>
          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.hifdh")}</CardTitle>
              <CardDescription>
                {`Achieved: ${breakdownBySection.hifdh.toFixed(1)} / ${MAX_HIFDH_DEDUCTION} pts`}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {breakdownBySection.hifdh >= MAX_HIFDH_DEDUCTION ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </span>
                </div>
              ) : (
                <span className={`text-3xl font-bold ${getScoreColor(breakdownBySection.hifdh / MAX_HIFDH_DEDUCTION * 100)}`}>
                  {breakdownBySection.hifdh.toFixed(1)} pts
                </span>
              )}
            </CardContent>
          </Card>

          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.tajweed")}</CardTitle>
              <CardDescription>
                {`Achieved: ${breakdownBySection.tajweed.toFixed(1)} / ${MAX_TAJWEED_DEDUCTION} pts`}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {breakdownBySection.tajweed >= MAX_TAJWEED_DEDUCTION ? (
                 <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </span>
                </div>
              ) : (
                <span className={`text-3xl font-bold ${getScoreColor(breakdownBySection.tajweed / MAX_TAJWEED_DEDUCTION * 100)}`}>
                  {breakdownBySection.tajweed.toFixed(1)} pts
                </span>
              )}
            </CardContent>
          </Card>

          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.waqf")}</CardTitle>
              <CardDescription>
                 {`Achieved: ${breakdownBySection.waqf.toFixed(1)} / ${MAX_WAQF_IBTIDA_DEDUCTION} pts`}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {breakdownBySection.waqf >= MAX_WAQF_IBTIDA_DEDUCTION ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </span>
                </div>
              ) : (
                 <span className={`text-3xl font-bold ${getScoreColor(breakdownBySection.waqf / MAX_WAQF_IBTIDA_DEDUCTION * 100)}`}>
                  {breakdownBySection.waqf.toFixed(1)} pts
                </span>
              )}
            </CardContent>
          </Card>
        </>
    );
  };
  
  const renderHusnAlAdaCard = () => (
    <Card className="h-auto">
      <CardHeader>
        <CardTitle>{t("jury.categories.husn_al_ada")}</CardTitle>
        <CardDescription>
          {getSectionWeight("husn_al_ada")} 
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        {breakdownBySection.husn_al_ada <= 0 ? (
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {t("status.noDeductions")}
            </span>
          </div>
        ) : (
          <span className="text-red-600 dark:text-red-500 text-3xl font-bold">
            -{breakdownBySection.husn_al_ada.toFixed(1)} pts
          </span>
        )}
      </CardContent>
    </Card>
  );

  const renderOverallBonusCard = () => (
    <Card className="h-auto">
      <CardHeader>
        <CardTitle>{t("jury.categories.overall_bonus_title")}</CardTitle>
        <CardDescription>
          {getSectionWeight("overall_bonus")}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        {breakdownBySection.overall_bonus > 0 ? (
           <span className="text-green-600 dark:text-green-500 text-3xl font-bold">
            +{breakdownBySection.overall_bonus.toFixed(1)} pts
          </span>
        ) : (
          <span className="text-muted-foreground text-lg">
            {t("status.noBonusAwarded")}
          </span>
        )}
      </CardContent>
    </Card>
  );

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
        <div className="flex justify-between items-center mb-6 pb-4 border-b">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {participant.name}
            </h2>
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
                <SelectItem value="average">
                  {t("jury.scoreSummary.averageOfAll")}
                </SelectItem>
                {participant.questionScores?.juryIds.map((id) => {
                  const jury = juryMembers.find(j => j.id === id);
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

        <Card className="mb-6 shadow-lg">
          <CardHeader className="text-center">
            <CardDescription>{t("jury.scoreSummary.totalScore")}</CardDescription>
            <CardTitle className={`text-5xl font-extrabold ${getScoreColor(finalPercentage)}`}>
              {finalPercentage.toFixed(1)} pts
            </CardTitle>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {renderCategoryCards()}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {renderHusnAlAdaCard()}
          {renderOverallBonusCard()}
        </div>
        
        <h3 className="text-xl font-semibold mb-3">{t("jury.questionBreakdown")}</h3>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="p-3 text-left font-medium">{t("jury.question")}</th>
                    {(Object.keys(activeQuestionDetailScores[questionNumbers[0]] || {}) as Array<keyof QuestionFields>)
                      .filter(key => key !== 'hifdh_stuck_count' || (activeQuestionDetailScores[questionNumbers[0]] && activeQuestionDetailScores[questionNumbers[0]].hifdh_stuck_count > 0))
                      .map((key) => (
                        <th key={key} className="p-3 text-center font-medium whitespace-nowrap">
                          {getCategoryName(key)}
                        </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questionNumbers.map((qNum) => {
                    const scoresForQuestion = activeQuestionDetailScores[qNum];
                    if (!scoresForQuestion) return null;
                    const isHifzVoided = scoresForQuestion.hifdh_judge_correction >= 4;

                    return (
                      <tr key={qNum} className={`border-b last:border-none ${isHifzVoided ? 'bg-red-50 dark:bg-red-900/30' : ''}`}>
                        <td className="p-3 font-medium">
                          {t("jury.question")} {qNum}
                          {isHifzVoided && (
                            <span className="ml-2 text-xs text-red-600 dark:text-red-400 font-semibold">({t("status.voided")})</span>
                          )}
                        </td>
                        {(Object.keys(scoresForQuestion) as Array<keyof QuestionFields>)
                          .filter(key => key !== 'hifdh_stuck_count' || scoresForQuestion.hifdh_stuck_count > 0)
                          .map((key) => (
                          <td key={key} className="p-3 text-center">
                            {scoresForQuestion[key]}
                            {(key === "hifdh_judge_correction" && scoresForQuestion[key] > 0 && scoresForQuestion[key] < 4) && isHifzVoided && (
                                <AlertTriangle className="h-4 w-4 text-red-500 inline-block ml-1" />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
    </DialogRoot>
  );
};
