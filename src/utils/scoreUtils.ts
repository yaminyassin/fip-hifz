import { QuestionFields } from "@/models/models";

/**
 * Calculate the final score for a participant based on all question scores
 * 
 * @param allScores Object containing scores for each question
 * @param totalQuestions Total number of questions
 * @returns Object with total percentage and breakdown by section
 */
export const calculateFinalScore = (
  allScores: { [questionNumber: number]: QuestionFields },
  totalQuestions: number
): { 
  percentage: number; 
  breakdownBySection: { 
    hifz: number; 
    tajweed: number; 
    waqf: number; 
    fluency: number 
  } 
} => {
  // Starting score
  let totalPercentage = 100;
  
  // Section weights
  const hifzWeight = 60; // 60% of total
  const tajweedWeight = 30; // 30% of total
  const waqfWeight = 10; // 10% of total
  
  // Weight per question
  const hifzPerQuestion = hifzWeight / totalQuestions;
  const tajweedPerQuestion = tajweedWeight / totalQuestions;
  const waqfPerQuestion = waqfWeight / totalQuestions;
  
  // Track deductions and bonus
  let totalHifzDeduction = 0;
  let totalTajweedDeduction = 0;
  let totalWaqfDeduction = 0;
  let totalFluencyBonus = 0;
  
  // Process each question's scores
  Object.values(allScores).forEach(scores => {
    // Calculate deductions for this question
    const hifzDeduction = 
      (scores.hifz_fath * 2) + // 2% per Fath error
      (scores.hifz_tannin * 1) + // 1% per Tannin error
      (scores.hifz_taraddud * 0.5); // 0.5% per Taraddud error
    
    const tajweedDeduction = 
      (scores.tajweed_jali * 2) + // 2% per Jali error
      (scores.tajweed_khafi * 1); // 1% per Khafi error
    
    const waqfDeduction = (scores.waqf_ibtida * 1); // 1% per ibtida error
    
    // Cap each category's deduction at its per-question weight
    totalHifzDeduction += Math.min(hifzPerQuestion, hifzDeduction);
    totalTajweedDeduction += Math.min(tajweedPerQuestion, tajweedDeduction);
    totalWaqfDeduction += Math.min(waqfPerQuestion, waqfDeduction);
    
    // Add fluency bonus (will be capped later)
    totalFluencyBonus += scores.fluency_bonus;
  });
  
  // Apply deductions
  totalPercentage -= (totalHifzDeduction + totalTajweedDeduction + totalWaqfDeduction);
  
  // Cap and add fluency bonus (max +5%)
  const cappedFluencyBonus = Math.min(5, totalFluencyBonus);
  totalPercentage += cappedFluencyBonus;
  
  // Create breakdown by section
  const hifzPercentage = hifzWeight - totalHifzDeduction;
  const tajweedPercentage = tajweedWeight - totalTajweedDeduction;
  const waqfPercentage = waqfWeight - totalWaqfDeduction;
  
  // Return final score (rounded to 2 decimal places) and breakdown
  return {
    percentage: Math.max(0, Math.min(105, Math.round(totalPercentage * 100) / 100)),
    breakdownBySection: {
      hifz: Math.max(0, Math.round(hifzPercentage * 100) / 100),
      tajweed: Math.max(0, Math.round(tajweedPercentage * 100) / 100),
      waqf: Math.max(0, Math.round(waqfPercentage * 100) / 100),
      fluency: Math.round(cappedFluencyBonus * 100) / 100
    }
  };
};

/**
 * Calculate the penalty for each error type
 * Returns a formatted string for display
 */
export const getErrorPenalty = (errorType: keyof QuestionFields): string => {
  const penalties: Record<keyof QuestionFields, string> = {
    hifz_fath: "-2%",
    hifz_tannin: "-1%",
    hifz_taraddud: "-0.5%",
    tajweed_jali: "-2%",
    tajweed_khafi: "-1%",
    waqf_ibtida: "-1%",
    fluency_bonus: "+1%"
  };
  
  return penalties[errorType] || "";
};

/**
 * Get section weight for display
 */
export const getSectionWeight = (section: 'hifz' | 'tajweed' | 'waqf' | 'fluency'): string => {
  const weights: Record<string, string> = {
    hifz: "60%",
    tajweed: "30%",
    waqf: "10%",
    fluency: "+5% max"
  };
  
  return weights[section] || "";
};

/**
 * Get max percentage deduction per category per question
 */
export const getMaxDeductionPerQuestion = (
  section: 'hifz' | 'tajweed' | 'waqf',
  totalQuestions: number
): number => {
  const sectionWeights = {
    hifz: 60,
    tajweed: 30,
    waqf: 10
  };
  
  return sectionWeights[section] / totalQuestions;
}; 