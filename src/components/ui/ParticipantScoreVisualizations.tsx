import { Participant, QuestionFields } from "@/models/models";
import { calculateFinalScore } from "@/utils/scoreUtils";
import { getCategoryConfig } from "@/lib/quranUtils";
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
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";

// Updated to include the new score format
type ParticipantWithScores = Participant & {
  questionScores?: {
    byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
    average: { [questionNumber: number]: QuestionFields };
    juryIds: string[];
  };
  overallBonuses?: Record<string, number>; // juryId -> overallBonus value
};

interface ParticipantScoreVisualizationsProps {
  participants: ParticipantWithScores[];
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

// Helper function to fill missing questions for all juries and calculate average
const fillMissingQuestionsAndCalculateAverage = (
  questionScores: {
    byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
    average: { [questionNumber: number]: QuestionFields };
    juryIds: string[];
  },
  category: string
): { [questionNumber: number]: QuestionFields } => {
  const categoryConfig = getCategoryConfig(category);
  const expectedQuestions = categoryConfig.numQuestions;

  // If we already have average scores that include all expected questions, use them
  const existingAverage = questionScores.average || {};
  const existingQuestionCount = Object.keys(existingAverage).length;

  if (existingQuestionCount >= expectedQuestions) {
    return fillMissingQuestionsWithPerfectScores(existingAverage, category);
  }

  // Otherwise, calculate average from individual jury scores, filling missing questions
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

  // Calculate average from filled jury scores
  const averageScores: { [questionNumber: number]: QuestionFields } = {};

  for (let questionNum = 1; questionNum <= expectedQuestions; questionNum++) {
    const questionScoresFromAllJuries = questionScores.juryIds
      .map((juryId) => filledByJury[juryId][questionNum])
      .filter(Boolean);

    if (questionScoresFromAllJuries.length > 0) {
      // Calculate average for each field
      const avgScores: QuestionFields = {
        hifdh_judge_correction: 0,
        hifdh_self_correction: 0,
        hifdh_stuck_count: 0,
        tajweed_major: 0,
        tajweed_minor: 0,
        waqf_ibtida_incorrect: 0,
        waqf_ibtida_meaning: 0,
        husn_al_ada_score: 0,
      };

      questionScoresFromAllJuries.forEach((scores) => {
        Object.keys(avgScores).forEach((key) => {
          avgScores[key as keyof QuestionFields] +=
            scores[key as keyof QuestionFields];
        });
      });

      Object.keys(avgScores).forEach((key) => {
        avgScores[key as keyof QuestionFields] = Math.round(
          avgScores[key as keyof QuestionFields] /
            questionScoresFromAllJuries.length
        );
      });

      averageScores[questionNum] = avgScores;
    } else {
      // No scores available, use perfect score
      averageScores[questionNum] = createPerfectQuestionScore();
    }
  }

  return averageScores;
};

export const ParticipantScoreVisualizations = ({
  participants,
}: ParticipantScoreVisualizationsProps) => {
  const { t } = useTranslation();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Filter participants by category if filter is active
  const filteredParticipants = useMemo(() => {
    if (categoryFilter === "all") {
      return participants;
    }
    return participants.filter((participant) => {
      const mainCategory = participant.category.charAt(0).toUpperCase();
      return mainCategory === categoryFilter;
    });
  }, [participants, categoryFilter]);

  // Calculate final scores for all participants that have scores
  const participantsWithScores = useMemo(() => {
    return filteredParticipants
      .filter(
        (p) =>
          p.questionScores &&
          (p.questionScores.average ||
            (p.questionScores.byJury && p.questionScores.juryIds.length > 0))
      )
      .map((participant) => {
        // Fill missing questions with perfect scores and calculate proper average
        const filledAverageScores = fillMissingQuestionsAndCalculateAverage(
          participant.questionScores!,
          participant.category
        );

        // Calculate average overall bonus across all juries
        let averageOverallBonus = 0;
        if (
          participant.overallBonuses &&
          participant.questionScores?.juryIds.length
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

        const scoreResult = calculateFinalScore(
          filledAverageScores,
          averageOverallBonus
        );

        return {
          ...participant,
          finalScore: scoreResult.percentage,
          breakdown: scoreResult.breakdownBySection,
          juryCount: participant.questionScores?.juryIds?.length || 0,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);
  }, [filteredParticipants]);

  // Calculate the strongest category overall
  const strongestCategory = useMemo(() => {
    if (participantsWithScores.length === 0)
      return { category: "hifdh", percentage: 0 };

    // Calculate the average percentage for each category
    let totalHifdh = 0;
    let totalTajweed = 0;
    let totalWaqf = 0;

    participantsWithScores.forEach((p) => {
      // These are the retention percentages (100 - deductions)
      totalHifdh += 100 - p.breakdown.hifdh;
      totalTajweed += 100 - p.breakdown.tajweed;
      totalWaqf += 100 - p.breakdown.waqf;
    });

    const avgHifdh = totalHifdh / participantsWithScores.length;
    const avgTajweed = totalTajweed / participantsWithScores.length;
    const avgWaqf = totalWaqf / participantsWithScores.length;

    // Find the maximum
    if (avgHifdh >= avgTajweed && avgHifdh >= avgWaqf) {
      return { category: "hifdh", percentage: avgHifdh };
    } else if (avgTajweed >= avgHifdh && avgTajweed >= avgWaqf) {
      return { category: "tajweed", percentage: avgTajweed };
    } else {
      return { category: "waqf", percentage: avgWaqf };
    }
  }, [participantsWithScores]);

  // Calculate category averages for visualization
  const categoryAverages = useMemo(() => {
    if (participantsWithScores.length === 0) {
      return { hifdh: 0, tajweed: 0, waqf: 0, husn_al_ada: 0, total: 0 };
    }

    const total = participantsWithScores.reduce(
      (acc, p) => {
        acc.hifdh += p.breakdown.hifdh;
        acc.tajweed += p.breakdown.tajweed;
        acc.waqf += p.breakdown.waqf;
        acc.husn_al_ada += p.breakdown.husn_al_ada;
        acc.total += p.finalScore;
        return acc;
      },
      { hifdh: 0, tajweed: 0, waqf: 0, husn_al_ada: 0, total: 0 }
    );

    return {
      hifdh: total.hifdh / participantsWithScores.length,
      tajweed: total.tajweed / participantsWithScores.length,
      waqf: total.waqf / participantsWithScores.length,
      husn_al_ada: total.husn_al_ada / participantsWithScores.length,
      total: total.total / participantsWithScores.length,
    };
  }, [participantsWithScores]);

  // Calculate score distribution for visualization
  const scoreDistribution = useMemo(() => {
    return {
      excellent: participantsWithScores.filter((p) => p.finalScore >= 90)
        .length,
      veryGood: participantsWithScores.filter(
        (p) => p.finalScore >= 80 && p.finalScore < 90
      ).length,
      good: participantsWithScores.filter(
        (p) => p.finalScore >= 70 && p.finalScore < 80
      ).length,
      average: participantsWithScores.filter(
        (p) => p.finalScore >= 60 && p.finalScore < 70
      ).length,
      belowAverage: participantsWithScores.filter((p) => p.finalScore < 60)
        .length,
    };
  }, [participantsWithScores]);

  // Check if we have enough data to show visualizations
  const hasParticipantsWithScores = participantsWithScores.length > 0;

  // Get top 5 participants for display
  const topParticipants = participantsWithScores.slice(0, 5);

  // Always render the component, but conditionally render the visualizations
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">
          {t("participants.visualizations.title")}
        </h2>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("participants.filter.by_category")}
          </span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <SelectValue
                  placeholder={t("participants.filter.all_categories")}
                />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("participants.filter.all_categories")}
              </SelectItem>
              <SelectItem value="A">
                {t("participants.filter.category_a")}
              </SelectItem>
              <SelectItem value="B">
                {t("participants.filter.category_b")}
              </SelectItem>
              <SelectItem value="C">
                {t("participants.filter.category_c")}
              </SelectItem>
              <SelectItem value="D">
                {t("participants.filter.category_d")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasParticipantsWithScores ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {/* Top Performers Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-500" />
                  {t("participants.visualizations.topPerformers")}
                </CardTitle>
                <CardDescription>
                  {t("participants.visualizations.topPerformersDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topParticipants.map((participant, i) => (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3"
                    >
                      <div className="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <p className="text-sm font-medium truncate">
                            {participant.name}
                          </p>
                          <p className="text-sm font-bold">
                            {participant.finalScore.toFixed(1)} pts
                          </p>
                        </div>
                        <Progress
                          value={participant.finalScore}
                          className="h-2"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Category Performance Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <BookOpenCheck className="h-5 w-5 text-blue-500" />
                  {t("participants.visualizations.categoryPerformance")}
                </CardTitle>
                <CardDescription>
                  {t("participants.visualizations.categoryPerformanceDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("jury.categories.hifdh")}
                      </p>
                      <p className="text-sm font-bold">
                        {categoryAverages.hifdh.toFixed(1)}%
                      </p>
                    </div>
                    <Progress value={categoryAverages.hifdh} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("jury.categories.tajweed")}
                      </p>
                      <p className="text-sm font-bold">
                        {categoryAverages.tajweed.toFixed(1)}%
                      </p>
                    </div>
                    <Progress
                      value={categoryAverages.tajweed}
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("jury.categories.waqf")}
                      </p>
                      <p className="text-sm font-bold">
                        {categoryAverages.waqf.toFixed(1)}%
                      </p>
                    </div>
                    <Progress value={categoryAverages.waqf} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("jury.categories.husn_al_ada")}
                      </p>
                      <p className="text-sm font-bold">
                        {categoryAverages.husn_al_ada.toFixed(1)}%
                      </p>
                    </div>
                    <Progress
                      value={categoryAverages.husn_al_ada * 10}
                      className="h-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Score Distribution Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Medal className="h-5 w-5 text-indigo-500" />
                  {t("participants.visualizations.scoreDistribution")}
                </CardTitle>
                <CardDescription>
                  {t("participants.visualizations.scoreDistributionDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("participants.visualizations.excellent")} (90-100%)
                      </p>
                      <p className="text-sm font-bold">
                        {scoreDistribution.excellent}
                      </p>
                    </div>
                    <Progress
                      value={
                        (scoreDistribution.excellent /
                          participantsWithScores.length) *
                        100
                      }
                      className="h-2 bg-emerald-100"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("participants.visualizations.veryGood")} (80-89%)
                      </p>
                      <p className="text-sm font-bold">
                        {scoreDistribution.veryGood}
                      </p>
                    </div>
                    <Progress
                      value={
                        (scoreDistribution.veryGood /
                          participantsWithScores.length) *
                        100
                      }
                      className="h-2 bg-blue-100"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("participants.visualizations.good")} (70-79%)
                      </p>
                      <p className="text-sm font-bold">
                        {scoreDistribution.good}
                      </p>
                    </div>
                    <Progress
                      value={
                        (scoreDistribution.good /
                          participantsWithScores.length) *
                        100
                      }
                      className="h-2 bg-sky-100"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("participants.visualizations.average")} (60-69%)
                      </p>
                      <p className="text-sm font-bold">
                        {scoreDistribution.average}
                      </p>
                    </div>
                    <Progress
                      value={
                        (scoreDistribution.average /
                          participantsWithScores.length) *
                        100
                      }
                      className="h-2 bg-orange-100"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-medium">
                        {t("participants.visualizations.belowAverage")}{" "}
                        (&lt;60%)
                      </p>
                      <p className="text-sm font-bold">
                        {scoreDistribution.belowAverage}
                      </p>
                    </div>
                    <Progress
                      value={
                        (scoreDistribution.belowAverage /
                          participantsWithScores.length) *
                        100
                      }
                      className="h-2 bg-red-100"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("participants.visualizations.averageScore")}
                    </p>
                    <p className="text-3xl font-bold mt-1">
                      {categoryAverages.total.toFixed(1)}%
                    </p>
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
                    <p className="text-3xl font-bold mt-1">
                      {participantsWithScores.length}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <Users className="h-6 w-6 text-purple-500 dark:text-purple-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("participants.visualizations.strongestCategory")}
                    </p>
                    <p className="text-3xl font-bold mt-1">
                      {t(`jury.categories.${strongestCategory.category}`)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {strongestCategory.percentage.toFixed(1)}%{" "}
                      {t("participants.visualizations.retentionRate")}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                    <BookOpenCheck className="h-6 w-6 text-amber-500 dark:text-amber-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category Strength Comparison (Top 3 Participants) */}
          {topParticipants.length > 2 && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  {t("participants.visualizations.topThreeComparison")}
                </CardTitle>
                <CardDescription>
                  {t("participants.visualizations.topThreeComparisonDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-6">
                  <div className="grid grid-cols-5 gap-2 text-sm font-medium text-center">
                    <div className="col-span-1"></div>
                    <div>{t("jury.categories.hifdh")}</div>
                    <div>{t("jury.categories.tajweed")}</div>
                    <div>{t("jury.categories.waqf")}</div>
                    <div>{t("jury.categories.husn_al_ada")}</div>
                  </div>

                  {topParticipants.slice(0, 3).map((participant, index) => (
                    <div
                      key={participant.id}
                      className="grid grid-cols-5 gap-2"
                    >
                      <div className="col-span-1 flex items-center gap-2">
                        <div
                          className={
                            index === 0
                              ? "w-3 h-3 rounded-full bg-amber-500"
                              : index === 1
                                ? "w-3 h-3 rounded-full bg-gray-500"
                                : "w-3 h-3 rounded-full bg-orange-800"
                          }
                        ></div>
                        <span className="font-medium truncate">
                          {participant.name}
                        </span>
                      </div>

                      <div className="relative pt-1">
                        <div className="h-2 bg-gray-200 rounded-full">
                          <div
                            className={
                              index === 0
                                ? "h-full rounded-full bg-amber-500"
                                : index === 1
                                  ? "h-full rounded-full bg-gray-500"
                                  : "h-full rounded-full bg-orange-800"
                            }
                            style={{
                              width: `${(participant.breakdown.hifdh / 60) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <span className="text-xs font-semibold">
                          {participant.breakdown.hifdh.toFixed(1)}%
                        </span>
                      </div>

                      <div className="relative pt-1">
                        <div className="h-2 bg-gray-200 rounded-full">
                          <div
                            className={
                              index === 0
                                ? "h-full rounded-full bg-amber-500"
                                : index === 1
                                  ? "h-full rounded-full bg-gray-500"
                                  : "h-full rounded-full bg-orange-800"
                            }
                            style={{
                              width: `${(participant.breakdown.tajweed / 30) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <span className="text-xs font-semibold">
                          {participant.breakdown.tajweed.toFixed(1)}%
                        </span>
                      </div>

                      <div className="relative pt-1">
                        <div className="h-2 bg-gray-200 rounded-full">
                          <div
                            className={
                              index === 0
                                ? "h-full rounded-full bg-amber-500"
                                : index === 1
                                  ? "h-full rounded-full bg-gray-500"
                                  : "h-full rounded-full bg-orange-800"
                            }
                            style={{
                              width: `${(participant.breakdown.waqf / 10) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <span className="text-xs font-semibold">
                          {participant.breakdown.waqf.toFixed(1)}%
                        </span>
                      </div>

                      <div className="relative pt-1">
                        <div className="h-2 bg-gray-200 rounded-full">
                          <div
                            className={
                              index === 0
                                ? "h-full rounded-full bg-amber-500"
                                : index === 1
                                  ? "h-full rounded-full bg-gray-500"
                                  : "h-full rounded-full bg-orange-800"
                            }
                            style={{
                              width: `${(participant.breakdown.husn_al_ada / 5) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <span className="text-xs font-semibold">
                          +{participant.breakdown.husn_al_ada.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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
                  : t("participants.visualizations.noParticipantsInCategory", {
                      category: categoryFilter,
                    })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
