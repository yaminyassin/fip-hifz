import { Card } from "@/components/shadcn/card";
import { Progress } from "@/components/shadcn/progress";
import { QuestionFields } from "@/models/models";
import { calculateFinalScore, getSectionWeight } from "@/utils/scoreUtils";
import { useTranslation } from "react-i18next";

interface ScoreSummaryProps {
  allScores: { [questionNumber: number]: QuestionFields };
}

export const ScoreSummary = ({ allScores }: ScoreSummaryProps) => {
  const { t } = useTranslation();

  // Get scores
  const result = calculateFinalScore(allScores);
  const { percentage, breakdownBySection } = result;

  // Format values for display
  const formattedPercentage = percentage.toFixed(1);
  const hifdhPercentage = breakdownBySection.hifdh.toFixed(1);
  const tajweedPercentage = breakdownBySection.tajweed.toFixed(1);
  const waqfPercentage = breakdownBySection.waqf.toFixed(1);
  const husnAlAdaBonus = breakdownBySection.husn_al_ada.toFixed(1);

  // Determine color based on percentage
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 75) return "text-blue-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-2">
        {t("jury.scoreSummary.title")}
      </h3>

      <div className="space-y-6">
        {/* Total Score with enhanced visibility */}
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">
              {t("jury.scoreSummary.totalScore")}
            </span>
            <span className={`text-2xl font-bold ${getScoreColor(percentage)}`}>
              {formattedPercentage}%
            </span>
          </div>
          <Progress
            value={Math.min(100, percentage)}
            className="h-2"
            indicatorClassName={`${
              percentage >= 90
                ? "bg-green-600"
                : percentage >= 75
                  ? "bg-blue-600"
                  : percentage >= 60
                    ? "bg-amber-600"
                    : "bg-red-600"
            }`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium">
                {t("jury.categories.hifdh")}
              </span>
              <span className="text-sm font-medium">
                {hifdhPercentage}%{" "}
                <span className="text-xs text-muted-foreground">
                  ({getSectionWeight("hifdh")})
                </span>
              </span>
            </div>
            <Progress
              value={(breakdownBySection.hifdh / 50) * 100}
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
                {tajweedPercentage}%{" "}
                <span className="text-xs text-muted-foreground">
                  ({getSectionWeight("tajweed")})
                </span>
              </span>
            </div>
            <Progress
              value={(breakdownBySection.tajweed / 30) * 100}
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
                {waqfPercentage}%{" "}
                <span className="text-xs text-muted-foreground">
                  ({getSectionWeight("waqf")})
                </span>
              </span>
            </div>
            <Progress
              value={(breakdownBySection.waqf / 10) * 100}
              className="h-1.5 bg-amber-100"
              indicatorClassName="bg-amber-600"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-sm font-medium">
                {t("jury.categories.husn_al_ada")}
              </span>
              <span className="text-sm font-medium text-green-600">
                +{husnAlAdaBonus}%{" "}
                <span className="text-xs text-muted-foreground">
                  ({getSectionWeight("husn_al_ada")})
                </span>
              </span>
            </div>
            <Progress
              value={(breakdownBySection.husn_al_ada / 10) * 100}
              className="h-1.5 bg-purple-100"
              indicatorClassName="bg-purple-600"
            />
          </div>
        </div>
      </div>
    </Card>
  );
};
