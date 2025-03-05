import { Participant, QuestionFields } from "@/models/models";
import { useTranslation } from "react-i18next";
import { calculateFinalScore, getErrorPenalty } from "@/utils/scoreUtils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { X, CheckCircle2 } from "lucide-react";

// Create our own dialog components since they don't exist in the project
const DialogRoot = ({ children, open, onOpenChange }: { children: React.ReactNode, open: boolean, onOpenChange: (open: boolean) => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto p-6">
        {children}
      </div>
    </div>
  );
};

type ParticipantWithScores = Participant & {
  questionScores?: {
    [key: number]: QuestionFields;
  };
};

interface ScoreDetailsDialogProps {
  participant: ParticipantWithScores;
  isOpen: boolean;
  onClose: () => void;
}

export const ScoreDetailsDialog = ({ participant, isOpen, onClose }: ScoreDetailsDialogProps) => {
  const { t } = useTranslation();
  
  if (!participant.questionScores) {
    return null;
  }
  
  const questionNumbers = Object.keys(participant.questionScores).map(Number);
  const totalQuestions = questionNumbers.length;
  
  const result = calculateFinalScore(participant.questionScores, totalQuestions);
  
  // Get category names for display
  const getCategoryName = (key: keyof QuestionFields) => {
    const categories: Record<keyof QuestionFields, string> = {
      hifz_fath: t("jury.categories.hifz_fath"),
      hifz_tannin: t("jury.categories.hifz_tannin"),
      hifz_taraddud: t("jury.categories.hifz_taraddud"),
      tajweed_jali: t("jury.categories.tajweed_jali"),
      tajweed_khafi: t("jury.categories.tajweed_khafi"),
      waqf_ibtida: t("jury.categories.waqf_ibtida"),
      fluency_bonus: t("jury.categories.fluency_bonus")
    };
    
    return categories[key];
  };

  // Calculate total deduction per question by category
  const calculateTotalDeduction = (questionNumber: number, category: 'hifz' | 'tajweed' | 'waqf') => {
    const scores = participant.questionScores?.[questionNumber];
    if (!scores) return 0;

    let deduction = 0;
    
    if (category === 'hifz') {
      deduction = (scores.hifz_fath * 2) + (scores.hifz_tannin * 1) + (scores.hifz_taraddud * 0.5);
    } else if (category === 'tajweed') {
      deduction = (scores.tajweed_jali * 2) + (scores.tajweed_khafi * 1);
    } else if (category === 'waqf') {
      deduction = scores.waqf_ibtida * 1;
    }
    
    return deduction;
  };

  // Check if there are any errors in a specific category across all questions
  const hasErrorsInCategory = (category: 'hifz' | 'tajweed' | 'waqf'): boolean => {
    return questionNumbers.some(questionNumber => {
      const scores = participant.questionScores?.[questionNumber];
      if (!scores) return false;

      if (category === 'hifz') {
        return scores.hifz_fath > 0 || scores.hifz_tannin > 0 || scores.hifz_taraddud > 0;
      } else if (category === 'tajweed') {
        return scores.tajweed_jali > 0 || scores.tajweed_khafi > 0;
      } else if (category === 'waqf') {
        return scores.waqf_ibtida > 0;
      }
      
      return false;
    });
  };
  
  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{participant.name} - {t("jury.scoreSummary.title")}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="mb-4">
        <p className="text-muted-foreground">{t("jury.scoreSummary.totalScoreExplanation")}</p>
        <h3 className="text-xl font-bold mt-2">
          {t("jury.scoreSummary.totalScore")}: {result.percentage.toFixed(1)}%
        </h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("jury.categories.hifz")} - {result.breakdownBySection.hifz.toFixed(1)}%</CardTitle>
            <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "60%" })}</CardDescription>
          </CardHeader>
          <CardContent>
            {hasErrorsInCategory('hifz') ? (
              <ul className="space-y-2">
                {questionNumbers.map((questionNumber) => {
                  const totalDeduction = calculateTotalDeduction(questionNumber, 'hifz');
                  const scores = participant.questionScores?.[questionNumber];
                  
                  if (!scores || totalDeduction === 0) return null;
                  
                  return (
                    <li key={`hifz-${questionNumber}`} className="border-b pb-2">
                      <div className="flex justify-between mb-2">
                        <p className="font-semibold">{t("jury.question")} {questionNumber}</p>
                        <p className="font-semibold text-destructive">-{totalDeduction.toFixed(1)}%</p>
                      </div>
                      <ul className="ml-4 space-y-1">
                        {scores.hifz_fath > 0 && (
                          <li className="text-sm text-destructive">
                            {getCategoryName('hifz_fath')}: {scores.hifz_fath}x
                          </li>
                        )}
                        {scores.hifz_tannin > 0 && (
                          <li className="text-sm text-destructive">
                            {getCategoryName('hifz_tannin')}: {scores.hifz_tannin}x
                          </li>
                        )}
                        {scores.hifz_taraddud > 0 && (
                          <li className="text-sm text-destructive">
                            {getCategoryName('hifz_taraddud')}: {scores.hifz_taraddud}x
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
        
        <Card>
          <CardHeader>
            <CardTitle>{t("jury.categories.tajweed")} - {result.breakdownBySection.tajweed.toFixed(1)}%</CardTitle>
            <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "30%" })}</CardDescription>
          </CardHeader>
          <CardContent>
            {hasErrorsInCategory('tajweed') ? (
              <ul className="space-y-2">
                {questionNumbers.map((questionNumber) => {
                  const totalDeduction = calculateTotalDeduction(questionNumber, 'tajweed');
                  const scores = participant.questionScores?.[questionNumber];
                  
                  if (!scores || totalDeduction === 0) return null;
                  
                  return (
                    <li key={`tajweed-${questionNumber}`} className="border-b pb-2">
                      <div className="flex justify-between mb-2">
                        <p className="font-semibold">{t("jury.question")} {questionNumber}</p>
                        <p className="font-semibold text-destructive">-{totalDeduction.toFixed(1)}%</p>
                      </div>
                      <ul className="ml-4 space-y-1">
                        {scores.tajweed_jali > 0 && (
                          <li className="text-sm text-destructive">
                            {getCategoryName('tajweed_jali')}: {scores.tajweed_jali}x
                          </li>
                        )}
                        {scores.tajweed_khafi > 0 && (
                          <li className="text-sm text-destructive">
                            {getCategoryName('tajweed_khafi')}: {scores.tajweed_khafi}x
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
        
        <Card>
          <CardHeader>
            <CardTitle>{t("jury.categories.waqf")} - {result.breakdownBySection.waqf.toFixed(1)}%</CardTitle>
            <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "10%" })}</CardDescription>
          </CardHeader>
          <CardContent>
            {hasErrorsInCategory('waqf') ? (
              <ul className="space-y-2">
                {questionNumbers.map((questionNumber) => {
                  const totalDeduction = calculateTotalDeduction(questionNumber, 'waqf');
                  const scores = participant.questionScores?.[questionNumber];
                  
                  if (!scores || totalDeduction === 0) return null;
                  
                  return (
                    <li key={`waqf-${questionNumber}`} className="border-b pb-2">
                      <div className="flex justify-between mb-2">
                        <p className="font-semibold">{t("jury.question")} {questionNumber}</p>
                        <p className="font-semibold text-destructive">-{totalDeduction.toFixed(1)}%</p>
                      </div>
                      <ul className="ml-4 space-y-1">
                        {scores.waqf_ibtida > 0 && (
                          <li className="text-sm text-destructive">
                            {getCategoryName('waqf_ibtida')}: {scores.waqf_ibtida}x
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
        
        <Card>
          <CardHeader>
            <CardTitle>{t("jury.categories.fluency")} - +{result.breakdownBySection.fluency.toFixed(1)}%</CardTitle>
            <CardDescription>{t("jury.categories.maxBonus")} +5% {t("jury.categories.total")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {t("jury.scoreSummary.fluencyExplanation")}
            </p>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-md border border-emerald-200 dark:border-emerald-800">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                <span className="font-medium">+{result.breakdownBySection.fluency.toFixed(1)}%</span> {t("jury.messages.overallPerformance")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="flex justify-end">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </div>
    </DialogRoot>
  );
}; 