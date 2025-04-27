import { Participant, QuestionFields } from "@/models/models";
import { useTranslation } from "react-i18next";
import { calculateFinalScore } from "@/utils/scoreUtils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { X, CheckCircle2 } from "lucide-react";
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
  const [activeScores, setActiveScores] = useState<{
    [questionNumber: number]: QuestionFields;
  }>({});
  const [juryName, setJuryName] = useState<string>("");
  const { data: juryMembers = [] } = useJuryMembers();

  // When the dialog opens or the selected jury changes, update the displayed scores
  useEffect(() => {
    if (!participant.questionScores) return;
    if (
      !participant.questionScores.average ||
      !participant.questionScores.byJury
    )
      return;

    if (selectedJuryId === "average") {
      setActiveScores(participant.questionScores.average);
      setJuryName(t("jury.scoreSummary.averageOfAll"));
    } else {
      setActiveScores(participant.questionScores.byJury[selectedJuryId] || {});
      // Find jury name from the juryMembers data
      const juryMember = juryMembers.find((jury) => jury.id === selectedJuryId);
      setJuryName(
        juryMember?.name ||
          t("jury.scoreSummary.juryMember", { id: selectedJuryId })
      );
    }
  }, [selectedJuryId, participant.questionScores, juryMembers, t]);

  if (!participant.questionScores) {
    return null;
  }

  if (
    !participant.questionScores.average ||
    !participant.questionScores.byJury ||
    !participant.questionScores.juryIds
  ) {
    return null;
  }

  const questionNumbers = Object.keys(activeScores).map(Number);

  const result = calculateFinalScore(activeScores);

  // Map the new QuestionFields keys to their translation keys
  const getCategoryName = (key: keyof QuestionFields) => {
    const categories: Record<keyof QuestionFields, string> = {
      hifdh_judge_correction: t("jury.categories.hifdh_judge_correction"),
      hifdh_self_correction: t("jury.categories.hifdh_self_correction"),
      hifdh_stuck_count: t("jury.categories.hifdh_stuck_count"),
      tajweed_major: t("jury.categories.tajweed_major"),
      tajweed_minor: t("jury.categories.tajweed_minor"),
      waqf_ibtida_incorrect: t("jury.categories.waqf_ibtida_incorrect"),
      waqf_ibtida_meaning: t("jury.categories.waqf_ibtida_meaning"),
      husn_al_ada_score: t("jury.categories.husn_al_ada_score"),
      overall_bonus: t("jury.categories.overall_bonus"),
    };

    return categories[key] || key; // Fallback to key name if translation missing
  };

  // Calculate total *count* of mistakes per question by category (for display)
  const calculateMistakeCount = (
    questionNumber: number,
    category: "hifdh" | "tajweed" | "waqf" // Use new aggregate names
  ) => {
    const scores = activeScores[questionNumber];
    if (!scores) return 0;

    let count = 0;

    if (category === "hifdh") {
      // Summing up different types of hifdh issues
      count =
        scores.hifdh_judge_correction +
        scores.hifdh_self_correction +
        scores.hifdh_stuck_count;
    } else if (category === "tajweed") {
      count = scores.tajweed_major + scores.tajweed_minor;
    } else if (category === "waqf") {
      // Summing up both types of waqf issues
      count = scores.waqf_ibtida_incorrect + scores.waqf_ibtida_meaning;
    }

    return count;
  };

  // Check if there are any errors in a specific category across all questions
  const hasErrorsInCategory = (
    category: "hifdh" | "tajweed" | "waqf" // Use new aggregate names
  ): boolean => {
    return questionNumbers.some((questionNumber) => {
      const scores = activeScores[questionNumber];
      if (!scores) return false;

      if (category === "hifdh") {
        return (
          scores.hifdh_judge_correction > 0 ||
          scores.hifdh_self_correction > 0 ||
          scores.hifdh_stuck_count > 0
        );
      } else if (category === "tajweed") {
        return scores.tajweed_major > 0 || scores.tajweed_minor > 0;
      } else if (category === "waqf") {
        return (
          scores.waqf_ibtida_incorrect > 0 || scores.waqf_ibtida_meaning > 0
        );
      }
      return false;
    });
  };

  // Function to render category cards
  const renderCategoryCards = () => {
    if (selectedJuryId === "average") {
      // For average view, only show the main category summaries
      return (
        <>
          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.hifdh")}</CardTitle>
              <CardDescription>
                {t("jury.categories.ofTotalScore", { percentage: "50%" })}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {result.breakdownBySection.hifdh >= 50 ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </span>
                </div>
              ) : (
                <span className="text-black dark:text-white text-3xl font-bold">
                  {result.breakdownBySection.hifdh.toFixed(1)}%
                </span>
              )}
            </CardContent>
          </Card>

          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.tajweed")}</CardTitle>
              <CardDescription>
                {t("jury.categories.ofTotalScore", { percentage: "30%" })}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {result.breakdownBySection.tajweed >= 30 ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </span>
                </div>
              ) : (
                <span className="text-black dark:text-white text-3xl font-bold">
                  {result.breakdownBySection.tajweed.toFixed(1)}%
                </span>
              )}
            </CardContent>
          </Card>

          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.waqf")}</CardTitle>
              <CardDescription>
                {t("jury.categories.ofTotalScore", { percentage: "10%" })}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {result.breakdownBySection.waqf >= 10 ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </span>
                </div>
              ) : (
                <span className="text-black dark:text-white text-3xl font-bold">
                  {result.breakdownBySection.waqf.toFixed(1)}%
                </span>
              )}
            </CardContent>
          </Card>
        </>
      );
    } else {
      // Count errors by category to determine how many questions have errors
      const hifdhQuestionsWithErrors = questionNumbers.filter(
        (questionNumber) => {
          const scores = activeScores[questionNumber];
          if (!scores) return false;
          return (
            scores.hifdh_judge_correction > 0 ||
            scores.hifdh_self_correction > 0 ||
            scores.hifdh_stuck_count > 0
          );
        }
      ).length;

      const tajweedQuestionsWithErrors = questionNumbers.filter(
        (questionNumber) => {
          const scores = activeScores[questionNumber];
          if (!scores) return false;
          return scores.tajweed_major > 0 || scores.tajweed_minor > 0;
        }
      ).length;

      const waqfQuestionsWithErrors = questionNumbers.filter(
        (questionNumber) => {
          const scores = activeScores[questionNumber];
          if (!scores) return false;
          return (
            scores.waqf_ibtida_incorrect > 0 || scores.waqf_ibtida_meaning > 0
          );
        }
      ).length;

      // For individual jury view, show detailed question breakdowns with dynamic sizing
      return (
        <>
          <Card
            className={`h-auto ${hifdhQuestionsWithErrors > 2 ? "row-span-2" : ""}`}
          >
            <CardHeader>
              <CardTitle>
                {t("jury.categories.hifdh")} -{" "}
                {result.breakdownBySection.hifdh.toFixed(1)}%
              </CardTitle>
              <CardDescription>
                {t("jury.categories.ofTotalScore", { percentage: "50%" })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasErrorsInCategory("hifdh") ? (
                <ul className="space-y-2">
                  {questionNumbers.map((questionNumber) => {
                    const scores = activeScores[questionNumber];
                    const mistakeCount = calculateMistakeCount(
                      questionNumber,
                      "hifdh"
                    );

                    if (!scores || mistakeCount === 0) return null;

                    return (
                      <li
                        key={`hifdh-${questionNumber}`}
                        className="border-b pb-2 last:border-0"
                      >
                        <div className="flex justify-between mb-1">
                          <p className="font-semibold">
                            {t("jury.question")} {questionNumber}
                          </p>
                        </div>
                        <ul className="ml-4 space-y-1 text-sm text-muted-foreground">
                          {scores.hifdh_judge_correction > 0 && (
                            <li>
                              {getCategoryName("hifdh_judge_correction")}:{" "}
                              <span className="font-medium text-destructive">
                                {scores.hifdh_judge_correction}x
                              </span>
                            </li>
                          )}
                          {scores.hifdh_self_correction > 0 && (
                            <li>
                              {getCategoryName("hifdh_self_correction")}:{" "}
                              <span className="font-medium text-destructive">
                                {scores.hifdh_self_correction}x
                              </span>
                            </li>
                          )}
                          {scores.hifdh_stuck_count > 0 && (
                            <li>
                              {getCategoryName("hifdh_stuck_count")}:{" "}
                              <span className="font-medium text-destructive">
                                {scores.hifdh_stuck_count}x
                              </span>
                            </li>
                          )}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-md border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className={`h-auto ${tajweedQuestionsWithErrors > 2 ? "row-span-2" : ""}`}
          >
            <CardHeader>
              <CardTitle>
                {t("jury.categories.tajweed")} -{" "}
                {result.breakdownBySection.tajweed.toFixed(1)}%
              </CardTitle>
              <CardDescription>
                {t("jury.categories.ofTotalScore", { percentage: "30%" })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasErrorsInCategory("tajweed") ? (
                <ul className="space-y-2">
                  {questionNumbers.map((questionNumber) => {
                    const scores = activeScores[questionNumber];
                    const mistakeCount = calculateMistakeCount(
                      questionNumber,
                      "tajweed"
                    );

                    if (!scores || mistakeCount === 0) return null;

                    return (
                      <li
                        key={`tajweed-${questionNumber}`}
                        className="border-b pb-2 last:border-0"
                      >
                        <div className="flex justify-between mb-1">
                          <p className="font-semibold">
                            {t("jury.question")} {questionNumber}
                          </p>
                        </div>
                        <ul className="ml-4 space-y-1 text-sm text-muted-foreground">
                          {scores.tajweed_major > 0 && (
                            <li>
                              {getCategoryName("tajweed_major")}:{" "}
                              <span className="font-medium text-destructive">
                                {scores.tajweed_major}x
                              </span>
                            </li>
                          )}
                          {scores.tajweed_minor > 0 && (
                            <li>
                              {getCategoryName("tajweed_minor")}:{" "}
                              <span className="font-medium text-destructive">
                                {scores.tajweed_minor}x
                              </span>
                            </li>
                          )}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-md border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className={`h-auto ${waqfQuestionsWithErrors > 2 ? "row-span-2" : ""}`}
          >
            <CardHeader>
              <CardTitle>
                {t("jury.categories.waqf")} -{" "}
                {result.breakdownBySection.waqf.toFixed(1)}%
              </CardTitle>
              <CardDescription>
                {t("jury.categories.ofTotalScore", { percentage: "10%" })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasErrorsInCategory("waqf") ? (
                <ul className="space-y-2">
                  {questionNumbers.map((questionNumber) => {
                    const scores = activeScores[questionNumber];
                    const mistakeCount = calculateMistakeCount(
                      questionNumber,
                      "waqf"
                    );

                    if (!scores || mistakeCount === 0) return null;

                    return (
                      <li
                        key={`waqf-${questionNumber}`}
                        className="border-b pb-2 last:border-0"
                      >
                        <div className="flex justify-between mb-1">
                          <p className="font-semibold">
                            {t("jury.question")} {questionNumber}
                          </p>
                        </div>
                        <ul className="ml-4 space-y-1 text-sm text-muted-foreground">
                          {scores.waqf_ibtida_incorrect > 0 && (
                            <li>
                              {getCategoryName("waqf_ibtida_incorrect")}:{" "}
                              <span className="font-medium text-destructive">
                                {scores.waqf_ibtida_incorrect}x
                              </span>
                            </li>
                          )}
                          {scores.waqf_ibtida_meaning > 0 && (
                            <li>
                              {getCategoryName("waqf_ibtida_meaning")}:{" "}
                              <span className="font-medium text-destructive">
                                {scores.waqf_ibtida_meaning}x
                              </span>
                            </li>
                          )}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-md border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("jury.categories.perfectPerformance")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      );
    }
  };

  // The Husn al-Ada card can be slightly modified
  const renderHusnAlAdaCard = () => (
    <Card className="h-auto">
      <CardHeader>
        <CardTitle>
          {t("jury.categories.husn_al_ada")} - +
          {result.breakdownBySection.husn_al_ada.toFixed(1)}%
        </CardTitle>
        <CardDescription>
          {t("jury.categories.maxBonus")} +10% {t("jury.categories.total")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {t("jury.scoreSummary.husnAlAdaExplanation")}
        </p>
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-md border border-emerald-200 dark:border-emerald-800">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            <span className="font-medium">
              +{result.breakdownBySection.husn_al_ada.toFixed(1)}%
            </span>{" "}
            {t("jury.messages.overallPerformance")}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  // Render Overall Bonus Card (New)
  const renderOverallBonusCard = () => (
    <Card className="h-auto">
      <CardHeader>
        <CardTitle>
          {t("jury.categories.overall_bonus")} - +
          {result.breakdownBySection.overall_bonus.toFixed(1)}%
        </CardTitle>
        <CardDescription>
          {t("jury.categories.maxBonus")} +3% {t("jury.categories.total")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {t("jury.scoreSummary.overallBonusExplanation")}
        </p>
        <div className="p-3 bg-sky-50 dark:bg-sky-950/30 rounded-md border border-sky-200 dark:border-sky-800">
          <p className="text-sm text-sky-600 dark:text-sky-400">
            <span className="font-medium">
              +{result.breakdownBySection.overall_bonus.toFixed(1)}%
            </span>{" "}
            {t("jury.messages.additionalPoints")}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">
          {participant.name} - {t("jury.scoreSummary.title")}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex flex-col mb-6 gap-2">
        <label htmlFor="jury-select" className="text-sm font-medium">
          {t("jury.scoreSummary.selectJury")}
        </label>

        <Select value={selectedJuryId} onValueChange={setSelectedJuryId}>
          <SelectTrigger id="jury-select" className="w-full sm:w-72">
            <SelectValue placeholder={t("jury.scoreSummary.selectJury")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="average">
              {t("jury.scoreSummary.averageOfAll")}
            </SelectItem>
            {participant.questionScores.juryIds &&
              participant.questionScores.juryIds.map((juryId) => {
                const jury = juryMembers.find((j) => j.id === juryId);
                return (
                  <SelectItem key={juryId} value={juryId}>
                    {jury?.name ||
                      t("jury.scoreSummary.juryMember", { id: juryId })}
                  </SelectItem>
                );
              })}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4">
        <p className="text-muted-foreground">
          {selectedJuryId !== "average" &&
            t("jury.scoreSummary.currentlyViewing") + ": " + juryName}
        </p>
        <div className="flex items-center mt-2">
          <h3 className="text-xl font-bold">
            {juryName}: {result.percentage.toFixed(1)}%
          </h3>
          {participant.questionScores.juryIds.length > 1 &&
            selectedJuryId === "average" && (
              <span className="text-sm text-muted-foreground ml-2">
                ({participant.questionScores.juryIds.length}{" "}
                {t("participants.table.juryCount")})
              </span>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 auto-rows-auto">
        {renderCategoryCards()}
        {renderHusnAlAdaCard()}
        {renderOverallBonusCard()}
      </div>

      <div className="flex justify-center">
        <Button onClick={onClose} variant="outline" className="min-w-32">
          {t("common.close")}
        </Button>
      </div>
    </DialogRoot>
  );
};
