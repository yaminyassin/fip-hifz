import { Participant, QuestionFields } from "@/models/models";
import { useTranslation } from "react-i18next";
import {
  calculateFinalScore,
  CalculatedScoreResult,
  MAX_HIFDH_DEDUCTION,
  MAX_TAJWEED_DEDUCTION,
  MAX_WAQF_IBTIDA_DEDUCTION,
  getSectionWeight,
  BASE_SCORE_PER_QUESTION,
  HIFDH_JUDGE_CORRECTION_PENALTY,
  HIFDH_SELF_CORRECTION_PENALTY,
  TAJWEED_MAJOR_PENALTY,
  TAJWEED_MINOR_PENALTY,
  WAQF_IBTIDA_INCORRECT_PENALTY,
  WAQF_IBTIDA_MEANING_PENALTY,
  HUSN_AL_ADA_MISTAKE_PENALTY,
} from "@/utils/scoreUtils";
import { getCategoryConfig } from "@/lib/quranUtils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  FileText,
} from "lucide-react";
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
  overallBonuses?: Record<string, number>; // juryId -> overallBonus value
  overallAverageScore?: CalculatedScoreResult;
  scoresByJury?: Record<string, CalculatedScoreResult>;
};

interface ScoreDetailsDialogProps {
  participant: ParticipantWithScores;
  isOpen: boolean;
  onClose: () => void;
}

// Helper function to create perfect question scores (100 points)
const createPerfectQuestionScore = (): QuestionFields => ({
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0,
  tajweed_major: 0,
  tajweed_minor: 0,
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  husn_al_ada_score: 0,
});

// Helper function to fill missing questions with perfect scores
const fillMissingQuestionsWithPerfectScores = (
  questionScores: { [questionNumber: number]: QuestionFields },
  category: string
): { [questionNumber: number]: QuestionFields } => {
  const categoryConfig = getCategoryConfig(category);
  const expectedQuestions = categoryConfig.numQuestions;
  const filledScores = { ...questionScores };

  // Fill missing questions (1 to expectedQuestions) with perfect scores
  for (let i = 1; i <= expectedQuestions; i++) {
    if (!filledScores[i]) {
      filledScores[i] = createPerfectQuestionScore();
    }
  }

  return filledScores;
};

// Helper function to fill missing questions for all juries
const fillMissingQuestionsForAllJuries = (
  questionScores: {
    byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
    average: { [questionNumber: number]: QuestionFields };
    juryIds: string[];
  },
  category: string
): {
  byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
  average: { [questionNumber: number]: QuestionFields };
  juryIds: string[];
} => {
  const filledByJury: Record<
    string,
    { [questionNumber: number]: QuestionFields }
  > = {};

  // Fill missing questions for each jury
  questionScores.juryIds.forEach((juryId) => {
    const juryScores = questionScores.byJury[juryId] || {};
    filledByJury[juryId] = fillMissingQuestionsWithPerfectScores(
      juryScores,
      category
    );
  });

  // Fill missing questions for average scores
  const filledAverage = fillMissingQuestionsWithPerfectScores(
    questionScores.average,
    category
  );

  return {
    byJury: filledByJury,
    average: filledAverage,
    juryIds: questionScores.juryIds,
  };
};

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
  const [displayedResult, setDisplayedResult] =
    useState<CalculatedScoreResult | null>(null);
  const [juryName, setJuryName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "per-question">(
    "overview"
  );
  const { data: juryMembers = [] } = useJuryMembers();

  useEffect(() => {
    if (!participant.questionScores) {
      setDisplayedResult(null);
      setActiveQuestionDetailScores({});
      return;
    }

    // Fill missing questions with perfect scores based on participant's category
    const filledQuestionScores = fillMissingQuestionsForAllJuries(
      participant.questionScores,
      participant.category
    );

    let scoresToCalculate: { [questionNumber: number]: QuestionFields } | null =
      null;
    let overallBonusForSelectedJury = 0;

    if (selectedJuryId === "average") {
      scoresToCalculate = filledQuestionScores.average;
      setJuryName(t("jury.scoreSummary.averageOfAll"));

      // Calculate average overall bonus across all juries
      if (
        participant.overallBonuses &&
        filledQuestionScores.juryIds.length > 0
      ) {
        const totalBonus = filledQuestionScores.juryIds.reduce(
          (sum, juryId) => {
            return sum + (participant.overallBonuses?.[juryId] || 0);
          },
          0
        );
        overallBonusForSelectedJury =
          totalBonus / filledQuestionScores.juryIds.length;
      }
    } else {
      scoresToCalculate = filledQuestionScores.byJury?.[selectedJuryId] || {};
      const juryMember = juryMembers.find((jury) => jury.id === selectedJuryId);
      setJuryName(
        juryMember?.name ||
          t("jury.scoreSummary.juryMember", { id: selectedJuryId })
      );

      // Get overall bonus for this specific jury
      overallBonusForSelectedJury =
        participant.overallBonuses?.[selectedJuryId] || 0;
    }

    if (scoresToCalculate && Object.keys(scoresToCalculate).length > 0) {
      setDisplayedResult(
        calculateFinalScore(
          scoresToCalculate as { [questionNumber: string]: QuestionFields },
          overallBonusForSelectedJury
        )
      );
      setActiveQuestionDetailScores(scoresToCalculate);
    } else {
      setDisplayedResult(null);
      setActiveQuestionDetailScores({});
    }
  }, [
    selectedJuryId,
    participant.questionScores,
    participant.overallBonuses,
    participant.category,
    juryMembers,
    t,
  ]);

  if (!participant.questionScores || !displayedResult) {
    return (
      <DialogRoot open={isOpen} onOpenChange={onClose}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {t("participants.visualizations.title")} - {participant.name}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("actions.close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <p>{t("messages.noData")}</p>
      </DialogRoot>
    );
  }

  const questionNumbers = Object.keys(activeQuestionDetailScores)
    .map(Number)
    .sort((a, b) => a - b);
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

  // Calculate score for individual question
  const calculateQuestionScore = (
    questionScores: QuestionFields
  ): { score: number; isVoid: boolean } => {
    let questionPoints = BASE_SCORE_PER_QUESTION;

    // Check if question is voided (4+ judge corrections)
    if (questionScores.hifdh_judge_correction >= 4) {
      return { score: 0, isVoid: true };
    }

    const isVoid = false;

    // Calculate deductions
    const hifdhDeduction =
      questionScores.hifdh_judge_correction * HIFDH_JUDGE_CORRECTION_PENALTY +
      questionScores.hifdh_self_correction * HIFDH_SELF_CORRECTION_PENALTY;

    const tajweedDeduction =
      questionScores.tajweed_major * TAJWEED_MAJOR_PENALTY +
      questionScores.tajweed_minor * TAJWEED_MINOR_PENALTY;

    const waqfDeduction =
      questionScores.waqf_ibtida_incorrect * WAQF_IBTIDA_INCORRECT_PENALTY +
      questionScores.waqf_ibtida_meaning * WAQF_IBTIDA_MEANING_PENALTY;

    const husnAlAdaDeduction =
      questionScores.husn_al_ada_score * HUSN_AL_ADA_MISTAKE_PENALTY;

    // Apply deductions with caps
    questionPoints -= Math.min(MAX_HIFDH_DEDUCTION, hifdhDeduction);
    questionPoints -= Math.min(MAX_TAJWEED_DEDUCTION, tajweedDeduction);
    questionPoints -= Math.min(MAX_WAQF_IBTIDA_DEDUCTION, waqfDeduction);
    questionPoints -= Math.min(10, husnAlAdaDeduction); // Max 10 for Husn Al-Ada

    return { score: Math.max(0, questionPoints), isVoid };
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
              <span
                className={`text-3xl font-bold ${getScoreColor((breakdownBySection.hifdh / MAX_HIFDH_DEDUCTION) * 100)}`}
              >
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
              <span
                className={`text-3xl font-bold ${getScoreColor((breakdownBySection.tajweed / MAX_TAJWEED_DEDUCTION) * 100)}`}
              >
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
              <span
                className={`text-3xl font-bold ${getScoreColor((breakdownBySection.waqf / MAX_WAQF_IBTIDA_DEDUCTION) * 100)}`}
              >
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
        <CardDescription>{getSectionWeight("husn_al_ada")}</CardDescription>
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
        <CardDescription>{getSectionWeight("overall_bonus")}</CardDescription>
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

  const renderOverviewTab = () => (
    <>
      <Card className="mb-6 shadow-lg">
        <CardHeader className="text-center">
          <CardDescription>{t("jury.scoreSummary.totalScore")}</CardDescription>
          <CardTitle
            className={`text-5xl font-extrabold ${getScoreColor(finalPercentage)}`}
          >
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

      <h3 className="text-xl font-semibold mb-3">
        {t("jury.questionBreakdown")}
      </h3>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="p-3 text-left font-medium">
                    {t("jury.question")}
                  </th>
                  {(
                    Object.keys(
                      activeQuestionDetailScores[questionNumbers[0]] || {}
                    ) as Array<keyof QuestionFields>
                  )
                    .filter(
                      (key) =>
                        key !== "hifdh_stuck_count" ||
                        (activeQuestionDetailScores[questionNumbers[0]] &&
                          activeQuestionDetailScores[questionNumbers[0]]
                            .hifdh_stuck_count > 0)
                    )
                    .map((key) => (
                      <th
                        key={key}
                        className="p-3 text-center font-medium whitespace-nowrap"
                      >
                        {getCategoryName(key)}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {questionNumbers.map((qNum) => {
                  const scoresForQuestion = activeQuestionDetailScores[qNum];
                  if (!scoresForQuestion) return null;
                  const isHifzVoided =
                    scoresForQuestion.hifdh_judge_correction >= 4;

                  return (
                    <tr
                      key={qNum}
                      className={`border-b last:border-none ${isHifzVoided ? "bg-red-50 dark:bg-red-900/30" : ""}`}
                    >
                      <td className="p-3 font-medium">
                        {t("jury.question")} {qNum}
                        {isHifzVoided && (
                          <span className="ml-2 text-xs text-red-600 dark:text-red-400 font-semibold">
                            ({t("status.voided")})
                          </span>
                        )}
                      </td>
                      {(
                        Object.keys(scoresForQuestion) as Array<
                          keyof QuestionFields
                        >
                      )
                        .filter(
                          (key) =>
                            key !== "hifdh_stuck_count" ||
                            scoresForQuestion.hifdh_stuck_count > 0
                        )
                        .map((key) => (
                          <td key={key} className="p-3 text-center">
                            {scoresForQuestion[key]}
                            {key === "hifdh_judge_correction" &&
                              scoresForQuestion[key] > 0 &&
                              scoresForQuestion[key] < 4 &&
                              isHifzVoided && (
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
    </>
  );

  const renderPerQuestionTab = () => {
    // Get the original questions that had scores before filling
    const originalQuestionNumbers = participant.questionScores
      ? Object.keys(participant.questionScores.average || {}).map(Number)
      : [];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {questionNumbers.map((qNum) => {
            const questionScores = activeQuestionDetailScores[qNum];
            if (!questionScores) return null;

            const { score, isVoid } = calculateQuestionScore(questionScores);
            const wasOriginallyMissing =
              !originalQuestionNumbers.includes(qNum);

            return (
              <Card
                key={qNum}
                className={`${isVoid ? "border-red-300 bg-red-50 dark:bg-red-900/20" : "border-border"}`}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    {t("jury.question")} {qNum}
                    <span
                      className={`text-2xl font-bold ${getScoreColor(score)}`}
                    >
                      {score.toFixed(1)} pts
                    </span>
                  </CardTitle>
                  {isVoid && (
                    <CardDescription className="text-red-600 dark:text-red-400 font-semibold">
                      {t("status.voided")} -{" "}
                      {t("jury.categories.hifdh_judge_correction")}:{" "}
                      {questionScores.hifdh_judge_correction}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Hifdh Section */}
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-muted-foreground">
                      {t("jury.categories.hifdh")}
                    </div>
                    <div className="text-xs space-y-1">
                      {questionScores.hifdh_judge_correction > 0 && (
                        <div className="flex justify-between">
                          <span>
                            {t("jury.categories.hifdh_judge_correction")}:
                          </span>
                          <span className="text-red-600">
                            -
                            {(
                              questionScores.hifdh_judge_correction *
                              HIFDH_JUDGE_CORRECTION_PENALTY
                            ).toFixed(1)}{" "}
                            pts
                          </span>
                        </div>
                      )}
                      {questionScores.hifdh_self_correction > 0 && (
                        <div className="flex justify-between">
                          <span>
                            {t("jury.categories.hifdh_self_correction")}:
                          </span>
                          <span className="text-orange-600">
                            -
                            {(
                              questionScores.hifdh_self_correction *
                              HIFDH_SELF_CORRECTION_PENALTY
                            ).toFixed(1)}{" "}
                            pts
                          </span>
                        </div>
                      )}
                      {questionScores.hifdh_stuck_count > 0 && (
                        <div className="flex justify-between">
                          <span>{t("jury.categories.hifdh_stuck_count")}:</span>
                          <span className="text-muted-foreground">
                            {questionScores.hifdh_stuck_count} (Info)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tajweed Section */}
                  {(questionScores.tajweed_major > 0 ||
                    questionScores.tajweed_minor > 0) && (
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        {t("jury.categories.tajweed")}
                      </div>
                      <div className="text-xs space-y-1">
                        {questionScores.tajweed_major > 0 && (
                          <div className="flex justify-between">
                            <span>{t("jury.categories.tajweed_major")}:</span>
                            <span className="text-red-600">
                              -
                              {(
                                questionScores.tajweed_major *
                                TAJWEED_MAJOR_PENALTY
                              ).toFixed(1)}{" "}
                              pts
                            </span>
                          </div>
                        )}
                        {questionScores.tajweed_minor > 0 && (
                          <div className="flex justify-between">
                            <span>{t("jury.categories.tajweed_minor")}:</span>
                            <span className="text-orange-600">
                              -
                              {(
                                questionScores.tajweed_minor *
                                TAJWEED_MINOR_PENALTY
                              ).toFixed(1)}{" "}
                              pts
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Waqf Section */}
                  {(questionScores.waqf_ibtida_incorrect > 0 ||
                    questionScores.waqf_ibtida_meaning > 0) && (
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        {t("jury.categories.waqf")}
                      </div>
                      <div className="text-xs space-y-1">
                        {questionScores.waqf_ibtida_incorrect > 0 && (
                          <div className="flex justify-between">
                            <span>
                              {t("jury.categories.waqf_ibtida_incorrect")}:
                            </span>
                            <span className="text-orange-600">
                              -
                              {(
                                questionScores.waqf_ibtida_incorrect *
                                WAQF_IBTIDA_INCORRECT_PENALTY
                              ).toFixed(1)}{" "}
                              pts
                            </span>
                          </div>
                        )}
                        {questionScores.waqf_ibtida_meaning > 0 && (
                          <div className="flex justify-between">
                            <span>
                              {t("jury.categories.waqf_ibtida_meaning")}:
                            </span>
                            <span className="text-red-600">
                              -
                              {(
                                questionScores.waqf_ibtida_meaning *
                                WAQF_IBTIDA_MEANING_PENALTY
                              ).toFixed(1)}{" "}
                              pts
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Husn Al-Ada Section */}
                  {questionScores.husn_al_ada_score > 0 && (
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        {t("jury.categories.husn_al_ada")}
                      </div>
                      <div className="text-xs">
                        <div className="flex justify-between">
                          <span>
                            {t("jury.categories.husn_al_ada_mistakes_count")}:
                          </span>
                          <span className="text-red-600">
                            -
                            {(
                              questionScores.husn_al_ada_score *
                              HUSN_AL_ADA_MISTAKE_PENALTY
                            ).toFixed(1)}{" "}
                            pts
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Perfect Performance */}
                  {score === BASE_SCORE_PER_QUESTION && !isVoid && (
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {t("jury.categories.perfectPerformance")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

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
            <SelectTrigger
              className="w-[200px]"
              aria-label={t("filter.byJury")}
            >
              <SelectValue placeholder={t("filter.selectJury")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="average">
                {t("jury.scoreSummary.averageOfAll")}
              </SelectItem>
              {participant.questionScores?.juryIds.map((id) => {
                const jury = juryMembers.find((j) => j.id === id);
                return (
                  <SelectItem key={id} value={id}>
                    {jury?.name || t("jury.scoreSummary.juryMember", { id })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("actions.close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
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

      {/* Tab Content */}
      {activeTab === "overview" && renderOverviewTab()}
      {activeTab === "per-question" && renderPerQuestionTab()}
    </DialogRoot>
  );
};
