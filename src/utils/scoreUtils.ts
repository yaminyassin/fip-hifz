import { QuestionFields } from "@/models/models";
import { RawScoreData } from "@/services/scores"; // Import the raw score type

// Define default scores within this utility file as well
const defaultScores: QuestionFields = {
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0,
  tajweed_major: 0,
  tajweed_minor: 0,
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  husn_al_ada_score: 0,
  overall_bonus: 0,
};

/**
 * Calculate the final average score for a participant based on scores from all questions.
 * Each question is scored out of 100, deductions are applied, Husn al-Ada is added,
 * then scores are averaged, and finally, the overall bonus is added.
 *
 * @param allScores Object containing scores for each question number.
 * @returns Object with final average percentage and average breakdown by section.
 */
export const calculateFinalScore = (allScores: {
  [questionNumber: number]: QuestionFields;
}): {
  percentage: number;
  breakdownBySection: {
    hifdh: number; // Average score contribution from Hifdh (max 50)
    tajweed: number; // Average score contribution from Tajweed (max 30)
    waqf: number; // Average score contribution from Waqf (max 10)
    husn_al_ada: number; // Average score contribution from Husn al-Ada (max 10)
    overall_bonus: number; // Total overall bonus added (max 3)
  };
} => {
  let totalScoreSum = 0;
  let validQuestionCount = 0;
  let totalOverallBonusSum = 0;

  // Track total contributions/deductions for average breakdown
  let totalHifdhScore = 0;
  let totalTajweedScore = 0;
  let totalWaqfScore = 0;
  let totalHusnAlAdaScore = 0;

  const questionScores = Object.values(allScores);

  if (questionScores.length === 0) {
    // Handle case with no scores
    return {
      percentage: 0,
      breakdownBySection: {
        hifdh: 0,
        tajweed: 0,
        waqf: 0,
        husn_al_ada: 0,
        overall_bonus: 0,
      },
    };
  }

  questionScores.forEach((scores) => {
    let questionScore = 100;
    let isVoid = false;

    // --- 1. Hifdh (50%) ---
    const hifdhMistakesCount =
      scores.hifdh_judge_correction + scores.hifdh_self_correction;

    // Apply 4-Mistake Rule
    if (hifdhMistakesCount >= 4) {
      questionScore = 0;
      isVoid = true;
    } else {
      // Calculate Hifdh deduction
      const hifdhDeduction =
        scores.hifdh_judge_correction * 1.5 +
        scores.hifdh_self_correction * 0.5;
      const cappedHifdhDeduction = Math.min(50, hifdhDeduction);
      questionScore -= cappedHifdhDeduction;
      totalHifdhScore += 50 - cappedHifdhDeduction; // Track score *contribution*
    }

    // Only calculate other sections if question is not void
    if (!isVoid) {
      // --- 2. Tajweed (30%) ---
      const tajweedDeduction =
        scores.tajweed_major * 1 + scores.tajweed_minor * 0.5;
      const cappedTajweedDeduction = Math.min(30, tajweedDeduction);
      questionScore -= cappedTajweedDeduction;
      totalTajweedScore += 30 - cappedTajweedDeduction;

      // --- 3. Waqf & Ibtida (10%) ---
      const waqfDeduction =
        scores.waqf_ibtida_incorrect * 0.5 + scores.waqf_ibtida_meaning * 1;
      const cappedWaqfDeduction = Math.min(10, waqfDeduction);
      questionScore -= cappedWaqfDeduction;
      totalWaqfScore += 10 - cappedWaqfDeduction;

      // --- 4. Husn al-Adā’ (10%) ---
      const husnAlAdaContribution = Math.min(10, scores.husn_al_ada_score || 0);
      questionScore += husnAlAdaContribution;
      totalHusnAlAdaScore += husnAlAdaContribution;

      // Ensure score is not negative
      questionScore = Math.max(0, questionScore);
    } else {
      // If void, section scores are 0 for breakdown calculation
      totalHifdhScore += 0;
      totalTajweedScore += 0;
      totalWaqfScore += 0;
      totalHusnAlAdaScore += 0;
    }

    // --- Accumulate Scores and Bonus ---
    validQuestionCount++;
    if (!isVoid) {
      totalScoreSum += questionScore;
    } else {
      validQuestionCount--;
    }
    totalOverallBonusSum += scores.overall_bonus || 0;
  });

  // --- Calculate Final Average and Bonus ---
  const averageScoreBeforeBonus =
    validQuestionCount > 0 ? totalScoreSum / validQuestionCount : 0;

  const cappedOverallBonus = Math.min(3, totalOverallBonusSum);
  const finalPercentage = averageScoreBeforeBonus + cappedOverallBonus;

  // --- Calculate Average Breakdown ---
  const avgBreakdown = {
    hifdh:
      validQuestionCount > 0
        ? Math.round((totalHifdhScore / validQuestionCount) * 100) / 100
        : 0,
    tajweed:
      validQuestionCount > 0
        ? Math.round((totalTajweedScore / validQuestionCount) * 100) / 100
        : 0,
    waqf:
      validQuestionCount > 0
        ? Math.round((totalWaqfScore / validQuestionCount) * 100) / 100
        : 0,
    husn_al_ada:
      validQuestionCount > 0
        ? Math.round((totalHusnAlAdaScore / validQuestionCount) * 100) / 100
        : 0,
    overall_bonus: Math.round(cappedOverallBonus * 100) / 100,
  };

  // Return final rounded percentage and breakdown
  return {
    percentage: Math.max(
      0,
      Math.min(103, Math.round(finalPercentage * 100) / 100)
    ), // Cap between 0 and 103
    breakdownBySection: avgBreakdown,
  };
};

/**
 * Get the penalty/bonus string for each score field type.
 * Returns a formatted string for display (e.g., "-1.5%", "+1%").
 */
export const getErrorPenalty = (errorType: keyof QuestionFields): string => {
  const penalties: Record<keyof QuestionFields, string> = {
    // Hifdh
    hifdh_judge_correction: "-1.5%",
    hifdh_self_correction: "-0.5%",
    hifdh_stuck_count: "", // No deduction for stuck count in scoring logic
    // Tajweed
    tajweed_major: "-1%",
    tajweed_minor: "-0.5%",
    // Waqf & Ibtida
    waqf_ibtida_incorrect: "-0.5%",
    waqf_ibtida_meaning: "-1%",
    // Husn al-Adā’
    husn_al_ada_score: "+ Score (0-10)", // Indicate it's a score input
    // Overall Bonus
    overall_bonus: "+ Bonus (0-3)", // Indicate it's a bonus input
  };

  return penalties[errorType] || "";
};

/**
 * Get section weight/contribution for display.
 */
export const getSectionWeight = (
  section: "hifdh" | "tajweed" | "waqf" | "husn_al_ada" | "overall_bonus"
): string => {
  const weights: Record<string, string> = {
    hifdh: "50%",
    tajweed: "30%",
    waqf: "10%",
    husn_al_ada: "10%",
    overall_bonus: "+3% max",
  };

  return weights[section] || "";
};

// Remove the old getMaxDeductionPerQuestion function as it's no longer applicable
/*
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
*/

/**
 * Calculates the final score for a single jury's evaluation of a participant.
 * @param allScores Object containing scores for each question number.
 * @returns Object with final rounded percentage and breakdown by section.
 */
export const calculateSingleJuryEvaluationScore = (allScores: {
  [questionNumber: number]: QuestionFields;
}): {
  percentage: number;
  breakdownBySection: {
    hifdh: number;
    tajweed: number;
    waqf: number;
    husn_al_ada: number;
    overall_bonus: number;
  };
} => {
  // Renamed from calculateFinalScore to be more specific
  // ... (rest of the existing calculateFinalScore logic remains exactly the same) ...
  let totalScoreSum = 0;
  let validQuestionCount = 0;
  let totalOverallBonusSum = 0;

  // Track total contributions/deductions for average breakdown
  let totalHifdhScore = 0;
  let totalTajweedScore = 0;
  let totalWaqfScore = 0;
  let totalHusnAlAdaScore = 0;

  const questionScores = Object.values(allScores);

  if (questionScores.length === 0) {
    // Handle case with no scores for this jury
    return {
      percentage: 0,
      breakdownBySection: {
        hifdh: 0,
        tajweed: 0,
        waqf: 0,
        husn_al_ada: 0,
        overall_bonus: 0,
      },
    };
  }

  questionScores.forEach((scores) => {
    let questionScore = 100;
    let isVoid = false;

    // --- 1. Hifdh (50%) ---
    const hifdhMistakesCount =
      scores.hifdh_judge_correction + scores.hifdh_self_correction;

    // Apply 4-Mistake Rule
    if (hifdhMistakesCount >= 4) {
      questionScore = 0;
      isVoid = true;
    } else {
      // Calculate Hifdh deduction
      const hifdhDeduction =
        scores.hifdh_judge_correction * 1.5 +
        scores.hifdh_self_correction * 0.5;
      const cappedHifdhDeduction = Math.min(50, hifdhDeduction);
      questionScore -= cappedHifdhDeduction;
      totalHifdhScore += 50 - cappedHifdhDeduction; // Track score *contribution*
    }

    // Only calculate other sections if question is not void
    if (!isVoid) {
      // --- 2. Tajweed (30%) ---
      const tajweedDeduction =
        scores.tajweed_major * 1 + scores.tajweed_minor * 0.5;
      const cappedTajweedDeduction = Math.min(30, tajweedDeduction);
      questionScore -= cappedTajweedDeduction;
      totalTajweedScore += 30 - cappedTajweedDeduction;

      // --- 3. Waqf & Ibtida (10%) ---
      const waqfDeduction =
        scores.waqf_ibtida_incorrect * 0.5 + scores.waqf_ibtida_meaning * 1;
      const cappedWaqfDeduction = Math.min(10, waqfDeduction);
      questionScore -= cappedWaqfDeduction;
      totalWaqfScore += 10 - cappedWaqfDeduction;

      // --- 4. Husn al-Adā’ (10%) ---
      const husnAlAdaContribution = Math.min(10, scores.husn_al_ada_score || 0);
      questionScore += husnAlAdaContribution;
      totalHusnAlAdaScore += husnAlAdaContribution;

      // Ensure score is not negative
      questionScore = Math.max(0, questionScore);
    } else {
      // If void, section scores are 0 for breakdown calculation
      totalHifdhScore += 0;
      totalTajweedScore += 0;
      totalWaqfScore += 0;
      totalHusnAlAdaScore += 0;
    }

    // --- Accumulate Scores and Bonus ---
    validQuestionCount++;
    if (!isVoid) {
      totalScoreSum += questionScore;
    } else {
      validQuestionCount--;
    }
    totalOverallBonusSum += scores.overall_bonus || 0;
  });

  // --- Calculate Final Average and Bonus ---
  const averageScoreBeforeBonus =
    validQuestionCount > 0 ? totalScoreSum / validQuestionCount : 0;

  const cappedOverallBonus = Math.min(3, totalOverallBonusSum);
  const finalPercentage = averageScoreBeforeBonus + cappedOverallBonus;

  // --- Calculate Average Breakdown ---
  // Average breakdown over the number of questions evaluated by this jury
  const evaluatedQuestionCount =
    questionScores.length > 0 ? questionScores.length : 1; // Avoid division by zero
  const avgBreakdown = {
    hifdh: Math.round((totalHifdhScore / evaluatedQuestionCount) * 100) / 100,
    tajweed:
      Math.round((totalTajweedScore / evaluatedQuestionCount) * 100) / 100,
    waqf: Math.round((totalWaqfScore / evaluatedQuestionCount) * 100) / 100,
    husn_al_ada:
      Math.round((totalHusnAlAdaScore / evaluatedQuestionCount) * 100) / 100,
    overall_bonus: Math.round(cappedOverallBonus * 100) / 100, // This is total bonus for this jury, not averaged per question
  };

  // Return final rounded percentage and breakdown for this single jury evaluation
  return {
    percentage: Math.max(
      0,
      Math.min(103, Math.round(finalPercentage * 100) / 100)
    ), // Cap between 0 and 103
    breakdownBySection: avgBreakdown,
  };
};

/**
 * Calculates the final average score for a participant across all evaluating jury members.
 * @param participantRawScores Array of all raw score documents for the participant.
 * @returns Object containing the final averaged percentage and breakdown, or null if no scores.
 */
export const calculateJuryAverageScore = (
  participantRawScores: RawScoreData[]
): {
  percentage: number;
  breakdownBySection: {
    hifdh: number;
    tajweed: number;
    waqf: number;
    husn_al_ada: number;
    overall_bonus: number;
  };
  juryCount: number;
} | null => {
  if (!participantRawScores || participantRawScores.length === 0) {
    return null;
  }

  // 1. Group scores by Jury ID
  const scoresByJury: { [juryId: string]: RawScoreData[] } = {};
  participantRawScores.forEach((score) => {
    if (!scoresByJury[score.juryId]) {
      scoresByJury[score.juryId] = [];
    }
    scoresByJury[score.juryId].push(score);
  });

  const juryIds = Object.keys(scoresByJury);
  if (juryIds.length === 0) {
    return null; // No jury evaluations found
  }

  // 2. Calculate final score for each jury
  let totalPercentageSum = 0;
  const totalBreakdownSum = {
    hifdh: 0,
    tajweed: 0,
    waqf: 0,
    husn_al_ada: 0,
    overall_bonus: 0,
  };
  let validJuryCount = 0;

  juryIds.forEach((juryId) => {
    const juryScores = scoresByJury[juryId];
    // Group scores by question number for calculateSingleJuryEvaluationScore
    const scoresByQuestion: { [qNum: number]: QuestionFields } = {};
    juryScores.forEach((s) => {
      // Ensure scores object exists and handle potential null/undefined fields
      scoresByQuestion[s.questionNumber] = {
        ...(s.scores || defaultScores), // Use default scores as base
        // Ensure all fields from defaultScores are present even if missing in s.scores
        ...Object.fromEntries(
          Object.entries(defaultScores).map(([key, defaultValue]) => [
            key,
            s.scores?.[key as keyof QuestionFields] ?? defaultValue,
          ])
        ),
      };
    });

    // Calculate score for this jury's evaluation
    const juryResult = calculateSingleJuryEvaluationScore(scoresByQuestion);

    totalPercentageSum += juryResult.percentage;
    totalBreakdownSum.hifdh += juryResult.breakdownBySection.hifdh;
    totalBreakdownSum.tajweed += juryResult.breakdownBySection.tajweed;
    totalBreakdownSum.waqf += juryResult.breakdownBySection.waqf;
    totalBreakdownSum.husn_al_ada += juryResult.breakdownBySection.husn_al_ada;
    totalBreakdownSum.overall_bonus +=
      juryResult.breakdownBySection.overall_bonus;
    validJuryCount++;
  });

  // 3. Average the results across all juries
  const finalAveragePercentage = totalPercentageSum / validJuryCount;
  const finalAverageBreakdown = {
    hifdh: totalBreakdownSum.hifdh / validJuryCount,
    tajweed: totalBreakdownSum.tajweed / validJuryCount,
    waqf: totalBreakdownSum.waqf / validJuryCount,
    husn_al_ada: totalBreakdownSum.husn_al_ada / validJuryCount,
    overall_bonus: totalBreakdownSum.overall_bonus / validJuryCount, // Average the total bonus awarded by each jury
  };

  return {
    // Round final averages
    percentage: Math.round(finalAveragePercentage * 100) / 100,
    breakdownBySection: {
      hifdh: Math.round(finalAverageBreakdown.hifdh * 100) / 100,
      tajweed: Math.round(finalAverageBreakdown.tajweed * 100) / 100,
      waqf: Math.round(finalAverageBreakdown.waqf * 100) / 100,
      husn_al_ada: Math.round(finalAverageBreakdown.husn_al_ada * 100) / 100,
      overall_bonus:
        Math.round(finalAverageBreakdown.overall_bonus * 100) / 100,
    },
    juryCount: validJuryCount,
  };
};
