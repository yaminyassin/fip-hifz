import { Participant, QuestionFields } from "@/models/models";
import { useTranslation } from "react-i18next";
import { calculateFinalScore, getErrorPenalty } from "@/utils/scoreUtils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { X, CheckCircle2, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from "@/components/shadcn/select";
import { useJuryMembers } from "@/hooks/useJuryMembers";

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

export const ScoreDetailsDialog = ({ participant, isOpen, onClose }: ScoreDetailsDialogProps) => {
  const { t } = useTranslation();
  const [selectedJuryId, setSelectedJuryId] = useState<string>("average");
  const [activeScores, setActiveScores] = useState<{ [questionNumber: number]: QuestionFields }>({});
  const [juryName, setJuryName] = useState<string>("");
  const { data: juryMembers = [] } = useJuryMembers();
  
  // When the dialog opens or the selected jury changes, update the displayed scores
  useEffect(() => {
    if (!participant.questionScores) return;
    if (!participant.questionScores.average || !participant.questionScores.byJury) return;
    
    if (selectedJuryId === "average") {
      setActiveScores(participant.questionScores.average);
      setJuryName(t("jury.scoreSummary.averageOfAll"));
    } else {
      setActiveScores(participant.questionScores.byJury[selectedJuryId] || {});
      // Find jury name from the juryMembers data
      const juryMember = juryMembers.find(jury => jury.id === selectedJuryId);
      setJuryName(juryMember?.name || t("jury.scoreSummary.juryMember", { id: selectedJuryId }));
    }
  }, [selectedJuryId, participant.questionScores, juryMembers, t]);
  
  if (!participant.questionScores) {
    return null;
  }

  if (!participant.questionScores.average || !participant.questionScores.byJury || !participant.questionScores.juryIds) {
    return null;
  }

  const questionNumbers = Object.keys(activeScores).map(Number);
  const totalQuestions = questionNumbers.length;
  
  const result = calculateFinalScore(activeScores, totalQuestions);

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
    const scores = activeScores[questionNumber];
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
      const scores = activeScores[questionNumber];
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
  
  // Function to render category cards
  const renderCategoryCards = () => {
    if (selectedJuryId === "average") {
      // For average view, only show the main category summaries
      return (
        <>
          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.hifz")}</CardTitle>
              <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "60%" })}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {result.breakdownBySection.hifz < 1 ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t("jury.categories.perfectPerformance")}</span>
                </div>
              ) : (
                <span className="text-black dark:text-white text-3xl font-bold">{result.breakdownBySection.hifz.toFixed(1)}%</span>
              )}
            </CardContent>
          </Card>
          
          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.tajweed")}</CardTitle>
              <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "30%" })}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {result.breakdownBySection.tajweed < 1 ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t("jury.categories.perfectPerformance")}</span>
                </div>
              ) : (
                <span className="text-black dark:text-white text-3xl font-bold">{result.breakdownBySection.tajweed.toFixed(1)}%</span>
              )}
            </CardContent>
          </Card>
          
          <Card className="h-auto">
            <CardHeader>
              <CardTitle>{t("jury.categories.waqf")}</CardTitle>
              <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "10%" })}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {result.breakdownBySection.waqf < 1 ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t("jury.categories.perfectPerformance")}</span>
                </div>
              ) : (
                <span className="text-black dark:text-white text-3xl font-bold">{result.breakdownBySection.waqf.toFixed(1)}%</span>
              )}
            </CardContent>
          </Card>
        </>
      );
    } else {
      // Count errors by category to determine how many questions have errors
      const hifzQuestionsWithErrors = questionNumbers.filter(questionNumber => {
        const scores = activeScores[questionNumber];
        if (!scores) return false;
        return scores.hifz_fath > 0 || scores.hifz_tannin > 0 || scores.hifz_taraddud > 0;
      }).length;
      
      const tajweedQuestionsWithErrors = questionNumbers.filter(questionNumber => {
        const scores = activeScores[questionNumber];
        if (!scores) return false;
        return scores.tajweed_jali > 0 || scores.tajweed_khafi > 0;
      }).length;
      
      const waqfQuestionsWithErrors = questionNumbers.filter(questionNumber => {
        const scores = activeScores[questionNumber];
        if (!scores) return false;
        return scores.waqf_ibtida > 0;
      }).length;
      
      // For individual jury view, show detailed question breakdowns with dynamic sizing
      return (
        <>
          <Card className={`h-auto ${hifzQuestionsWithErrors > 2 ? 'row-span-2' : ''}`}>
            <CardHeader>
              <CardTitle>{t("jury.categories.hifz")} - {result.breakdownBySection.hifz.toFixed(1)}%</CardTitle>
              <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "60%" })}</CardDescription>
            </CardHeader>
            <CardContent>
              {hasErrorsInCategory('hifz') ? (
                <ul className="space-y-2">
                  {questionNumbers.map((questionNumber) => {
                    const totalDeduction = calculateTotalDeduction(questionNumber, 'hifz');
                    const scores = activeScores[questionNumber];
                    
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
          
          <Card className={`h-auto ${tajweedQuestionsWithErrors > 2 ? 'row-span-2' : ''}`}>
            <CardHeader>
              <CardTitle>{t("jury.categories.tajweed")} - {result.breakdownBySection.tajweed.toFixed(1)}%</CardTitle>
              <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "30%" })}</CardDescription>
            </CardHeader>
            <CardContent>
              {hasErrorsInCategory('tajweed') ? (
                <ul className="space-y-2">
                  {questionNumbers.map((questionNumber) => {
                    const totalDeduction = calculateTotalDeduction(questionNumber, 'tajweed');
                    const scores = activeScores[questionNumber];
                    
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
          
          <Card className={`h-auto ${waqfQuestionsWithErrors > 2 ? 'row-span-2' : ''}`}>
            <CardHeader>
              <CardTitle>{t("jury.categories.waqf")} - {result.breakdownBySection.waqf.toFixed(1)}%</CardTitle>
              <CardDescription>{t("jury.categories.ofTotalScore", { percentage: "10%" })}</CardDescription>
            </CardHeader>
            <CardContent>
              {hasErrorsInCategory('waqf') ? (
                <ul className="space-y-2">
                  {questionNumbers.map((questionNumber) => {
                    const totalDeduction = calculateTotalDeduction(questionNumber, 'waqf');
                    const scores = activeScores[questionNumber];
                    
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
        </>
      );
    }
  };
  
  // The fluency card is the same for both views
  const renderFluencyCard = () => (
    <Card className="h-auto">
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
  );
  
  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{participant.name} - {t("jury.scoreSummary.title")}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.close")}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex flex-col mb-6 gap-2">
        <label htmlFor="jury-select" className="text-sm font-medium">
          {t("jury.scoreSummary.selectJury")}
        </label>
        
        <Select 
          value={selectedJuryId} 
          onValueChange={setSelectedJuryId}
        >
          <SelectTrigger id="jury-select" className="w-full sm:w-72">
            <SelectValue placeholder={t("jury.scoreSummary.selectJury")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="average">{t("jury.scoreSummary.averageOfAll")}</SelectItem>
            {participant.questionScores.juryIds && participant.questionScores.juryIds.map(juryId => {
              const jury = juryMembers.find(j => j.id === juryId);
              return (
                <SelectItem key={juryId} value={juryId}>
                  {jury?.name || t("jury.scoreSummary.juryMember", { id: juryId })}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      
      <div className="mb-4">
        <p className="text-muted-foreground">
          {selectedJuryId !== "average" && t("jury.scoreSummary.currentlyViewing") + ": " + juryName}
        </p>
        <div className="flex items-center mt-2">
          <h3 className="text-xl font-bold">
            {juryName}: {result.percentage.toFixed(1)}%
          </h3>
          {participant.questionScores.juryIds.length > 1 && selectedJuryId === "average" && (
            <span className="text-sm text-muted-foreground ml-2">
              ({participant.questionScores.juryIds.length} {t("participants.table.juryCount")})
            </span>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 auto-rows-auto">
        {renderCategoryCards()}
        {renderFluencyCard()}
      </div>
      
      <div className="flex justify-center">
        <Button onClick={onClose} variant="outline" className="min-w-32">
          {t("common.close")}
        </Button>
      </div>
    </DialogRoot>
  );
}; 