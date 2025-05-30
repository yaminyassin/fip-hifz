import { Card } from "@/components/shadcn/card";
import { Progress } from "@/components/shadcn/progress";
import { QuestionFields } from "@/models/models";
import {
  calculateFinalScore,
  CalculatedScoreResult,
  BASE_SCORE_PER_QUESTION,
  MAX_HIFDH_DEDUCTION,
  MAX_TAJWEED_DEDUCTION,
  MAX_WAQF_IBTIDA_DEDUCTION,
  MAX_HUSN_AL_ADA_DEDUCTION,
  TOTAL_OVERALL_BONUS_CAP,
} from "@/utils/scoreUtils";
import { useTranslation } from "react-i18next";

interface ScoreSummaryProps {
  allScores: { [questionNumber: number]: QuestionFields };
  overallBonus?: number;
}

export const ScoreSummary = ({
  allScores,
  overallBonus,
}: ScoreSummaryProps) => {
  const { t } = useTranslation();

  const result: CalculatedScoreResult = calculateFinalScore(
    allScores,
    overallBonus
  );
  const { percentage, breakdownBySection } = result;

  const formattedPercentage = percentage.toFixed(1);
  const hifdhPoints = breakdownBySection.hifdh.toFixed(1);
  const tajweedPoints = breakdownBySection.tajweed.toFixed(1);
  const waqfPoints = breakdownBySection.waqf.toFixed(1);
  const husnAlAdaDeductedPoints = breakdownBySection.husn_al_ada.toFixed(1);
  const overallBonusPoints = breakdownBySection.overall_bonus.toFixed(1);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 80) return "text-blue-600";
    if (score >= 70) return "text-yellow-600";
    if (score >= 60) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-2">
        {t("jury.scoreSummary.title")}
      </h3>

      <div className="space-y-6">
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">
              {t("jury.scoreSummary.totalScore")}
            </span>
            <span className={`text-2xl font-bold ${getScoreColor(percentage)}`}>
              {formattedPercentage} pts
            </span>
          </div>
          <Progress
            value={Math.min(BASE_SCORE_PER_QUESTION, percentage)}
            className="h-2"
            indicatorClassName={`${
              percentage >= 90
                ? "bg-green-600"
                : percentage >= 80
                  ? "bg-blue-600"
                  : percentage >= 70
                    ? "bg-yellow-600"
                    : percentage >= 60
                      ? "bg-orange-600"
                      : "bg-red-600"
            }`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium">
                {t("jury.categories.hifdh")}
              </span>
              <span className="text-sm font-medium">
                {hifdhPoints} pts{" "}
                <span className="text-xs text-muted-foreground">
                  (Achieved / {MAX_HIFDH_DEDUCTION} pts)
                </span>
              </span>
            </div>
            <Progress
              value={(breakdownBySection.hifdh / MAX_HIFDH_DEDUCTION) * 100}
              className="h-1.5 bg-blue-100"
              indicatorClassName="bg-blue-600"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium">
                {t("jury.categories.tajweed")}
              </span>
              <span className="text-sm font-medium">
                {tajweedPoints} pts{" "}
                <span className="text-xs text-muted-foreground">
                  (Achieved / {MAX_TAJWEED_DEDUCTION} pts)
                </span>
              </span>
            </div>
            <Progress
              value={(breakdownBySection.tajweed / MAX_TAJWEED_DEDUCTION) * 100}
              className="h-1.5 bg-green-100"
              indicatorClassName="bg-green-600"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium">
                {t("jury.categories.waqf")}
              </span>
              <span className="text-sm font-medium">
                {waqfPoints} pts{" "}
                <span className="text-xs text-muted-foreground">
                  (Achieved / {MAX_WAQF_IBTIDA_DEDUCTION} pts)
                </span>
              </span>
            </div>
            <Progress
              value={
                (breakdownBySection.waqf / MAX_WAQF_IBTIDA_DEDUCTION) * 100
              }
              className="h-1.5 bg-yellow-100"
              indicatorClassName="bg-yellow-600"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium">
                {t("jury.categories.husn_al_ada")}
              </span>
              <span className="text-sm font-medium text-red-600">
                -{husnAlAdaDeductedPoints} pts{" "}
                <span className="text-xs text-muted-foreground">
                  (Deducted / Max {MAX_HUSN_AL_ADA_DEDUCTION} pts)
                </span>
              </span>
            </div>
            <Progress
              value={
                (breakdownBySection.husn_al_ada / MAX_HUSN_AL_ADA_DEDUCTION) *
                100
              }
              className="h-1.5 bg-red-100"
              indicatorClassName="bg-red-600"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">
                {t("jury.categories.overall_bonus_title")}
              </span>
              <span className="text-sm font-medium text-green-600">
                +{overallBonusPoints} pts{" "}
                <span className="text-xs text-muted-foreground">
                  (Bonus Added / Max {TOTAL_OVERALL_BONUS_CAP} pts)
                </span>
              </span>
            </div>
            <Progress
              value={
                (breakdownBySection.overall_bonus / TOTAL_OVERALL_BONUS_CAP) *
                100
              }
              className="h-1.5 bg-purple-100"
              indicatorClassName="bg-purple-600"
            />
          </div>
        </div>
      </div>
    </Card>
  );
};
