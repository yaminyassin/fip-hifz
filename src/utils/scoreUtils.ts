import { QuestionFields } from "@/models/models";
import { RawScoreData } from "@/services/scores"; // Import the raw score type

// Define default scores
export const defaultScores: QuestionFields = {
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0, // Informational
  tajweed_major: 0,
  tajweed_minor: 0,
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  husn_al_ada_score: 0, // Count of mistakes
  // overall_bonus is now in separate collection
};

// Scoring constants
export const BASE_SCORE_PER_QUESTION = 100;

export const HIFDH_JUDGE_CORRECTION_PENALTY = 3;
export const HIFDH_SELF_CORRECTION_PENALTY = 2;
export const HIFDH_MISTAKE_VOID_THRESHOLD = 3; // Judge corrections >= 3 voids question
export const MAX_HIFDH_DEDUCTION = 50;

export const TAJWEED_MAJOR_PENALTY = 2;
export const TAJWEED_MINOR_PENALTY = 1;
export const MAX_TAJWEED_DEDUCTION = 30;

export const WAQF_IBTIDA_INCORRECT_PENALTY = 0.3;
export const WAQF_IBTIDA_MEANING_PENALTY = 0.7;
export const MAX_WAQF_IBTIDA_DEDUCTION = 10;

export const HUSN_AL_ADA_MISTAKE_PENALTY = 1;
export const MAX_HUSN_AL_ADA_DEDUCTION = 10;

export const OVERALL_BONUS_CAP_PER_QUESTION = 5; // Max bonus points per question
export const TOTAL_OVERALL_BONUS_CAP = 5; // Max total bonus points added to final average

export interface ScoreBreakdown {
  hifdh: number; // Average points achieved in Hifdh (e.g., 50 - avg_deduction)
  tajweed: number; // Average points achieved in Tajweed (e.g., 30 - avg_deduction)
  waqf: number; // Average points achieved in Waqf (e.g., 10 - avg_deduction)
  husn_al_ada: number; // Average points deducted for Husn al-Ada
  overall_bonus: number; // Total overall bonus points added
}

export interface CalculatedScoreResult {
  percentage: number; // Average of question scores (0-100), bonus tracked separately
  breakdownBySection: ScoreBreakdown;
}

const calculateScoreLogic = (
  allScores: { [questionNumber: number]: QuestionFields },
  participantBonusOverride?: number // New parameter for participant-level bonus
): CalculatedScoreResult => {
  let totalPointsSum = 0;
  let totalQuestionCount = 0; // Changed: now counts ALL questions including voided

  // For breakdown: sum of (max_deductible_points - actual_deduction_for_category) for each question
  let totalHifdhContribution = 0;
  let totalTajweedContribution = 0;
  let totalWaqfContribution = 0;
  let totalHusnAlAdaDeduction = 0; // Sum of actual Husn Al-Ada deductions

  const questionScoresArray = Object.values(allScores);

  if (questionScoresArray.length === 0) {
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

  questionScoresArray.forEach((scores) => {
    // Each question starts with 100 points
    let questionPoints = BASE_SCORE_PER_QUESTION;
    let isVoid = false;

    // --- 1. Hifdh ---
    // Apply 4-Mistake Rule (ONLY based on Judge Corrections)
    if (scores.hifdh_judge_correction >= HIFDH_MISTAKE_VOID_THRESHOLD) {
      questionPoints = 0;
      isVoid = true;
      // For breakdown, if void, this question contributes 0 to Hifdh
      totalHifdhContribution += 0;
    } else {
      const hifdhDeduction =
        scores.hifdh_judge_correction * HIFDH_JUDGE_CORRECTION_PENALTY +
        scores.hifdh_self_correction * HIFDH_SELF_CORRECTION_PENALTY;
      const cappedHifdhDeduction = Math.min(
        MAX_HIFDH_DEDUCTION,
        hifdhDeduction
      );
      questionPoints -= cappedHifdhDeduction;
      totalHifdhContribution += MAX_HIFDH_DEDUCTION - cappedHifdhDeduction;
    }

    if (!isVoid) {
      // --- 2. Tajweed ---
      const tajweedDeduction =
        scores.tajweed_major * TAJWEED_MAJOR_PENALTY +
        scores.tajweed_minor * TAJWEED_MINOR_PENALTY;
      const cappedTajweedDeduction = Math.min(
        MAX_TAJWEED_DEDUCTION,
        tajweedDeduction
      );
      questionPoints -= cappedTajweedDeduction;
      totalTajweedContribution +=
        MAX_TAJWEED_DEDUCTION - cappedTajweedDeduction;

      // --- 3. Waqf & Ibtida ---
      const waqfDeduction =
        scores.waqf_ibtida_incorrect * WAQF_IBTIDA_INCORRECT_PENALTY +
        scores.waqf_ibtida_meaning * WAQF_IBTIDA_MEANING_PENALTY;
      const cappedWaqfDeduction = Math.min(
        MAX_WAQF_IBTIDA_DEDUCTION,
        waqfDeduction
      );
      questionPoints -= cappedWaqfDeduction;
      totalWaqfContribution += MAX_WAQF_IBTIDA_DEDUCTION - cappedWaqfDeduction;

      // --- 4. Husn Al-Ada ---
      // husn_al_ada_score is the count of mistakes
      const husnAlAdaDeduction =
        scores.husn_al_ada_score * HUSN_AL_ADA_MISTAKE_PENALTY;
      const cappedHusnAlAdaDeduction = Math.min(
        MAX_HUSN_AL_ADA_DEDUCTION,
        husnAlAdaDeduction
      );
      questionPoints -= cappedHusnAlAdaDeduction;
      totalHusnAlAdaDeduction += cappedHusnAlAdaDeduction; // Sum of actual deductions
    } else {
      // If void, other categories also contribute 0 for this question's breakdown
      totalTajweedContribution += 0;
      totalWaqfContribution += 0;
      // Husn Al-Ada deduction is 0 for a voided question in terms of impact
    }

    // Ensure question points are not negative (minimum 0 per question)
    questionPoints = Math.max(0, questionPoints);

    // --- Accumulate Question Scores ---
    // CHANGED: Now count ALL questions including voided ones (which have score = 0)
    totalPointsSum += questionPoints;
    totalQuestionCount++;
  });

  // --- Calculate Final Score: Average of Question Scores (bonus displayed separately) ---
  // Step 1: Calculate average of question scores (now includes voided questions with score = 0)
  const averageQuestionScore =
    totalQuestionCount > 0 ? totalPointsSum / totalQuestionCount : 0;

  // Step 2: Track overall bonus for display purposes (participant-level)
  let overallBonusPoints = 0;
  if (participantBonusOverride !== undefined) {
    overallBonusPoints = Math.min(
      TOTAL_OVERALL_BONUS_CAP,
      participantBonusOverride
    );
  }

  // Step 3: Final total score = average question score only (not inflated by bonus)
  // The bonus is tracked separately for breakdown display
  const finalTotalScore = averageQuestionScore;

  // Ensure final score is within reasonable bounds (0 to 100 max for average)
  const cappedFinalScore = Math.max(
    0,
    Math.min(BASE_SCORE_PER_QUESTION, finalTotalScore)
  );

  // --- Calculate Average Breakdown for Display ---
  // For breakdown visualization: average contribution per category
  const numQuestionsForBreakdown =
    questionScoresArray.length > 0 ? questionScoresArray.length : 1;

  const avgBreakdown: ScoreBreakdown = {
    hifdh:
      Math.round((totalHifdhContribution / numQuestionsForBreakdown) * 100) /
      100,
    tajweed:
      Math.round((totalTajweedContribution / numQuestionsForBreakdown) * 100) /
      100,
    waqf:
      Math.round((totalWaqfContribution / numQuestionsForBreakdown) * 100) /
      100,
    // This is average DEDUCTION per question
    husn_al_ada:
      Math.round((totalHusnAlAdaDeduction / numQuestionsForBreakdown) * 100) /
      100,
    overall_bonus: Math.round(overallBonusPoints * 100) / 100,
  };

  return {
    percentage: Math.round(cappedFinalScore * 100) / 100,
    breakdownBySection: avgBreakdown,
  };
};

/**
 * Calculate the final total score for a participant based on scores from all questions.
 * Returns: average of question scores (bonus tracked separately for display)
 * Each question can have a maximum of 100 points.
 * Final result range: 0-100 points (representing true average performance)
 */
export const calculateFinalScore = (
  allScores: {
    [questionNumber: string]: QuestionFields;
  },
  participantBonusOverride?: number // Participant-level overall bonus (0-5 points)
): CalculatedScoreResult => {
  const normalizedScores: { [questionNumber: number]: QuestionFields } = {};
  for (const key in allScores) {
    if (Object.prototype.hasOwnProperty.call(allScores, key)) {
      normalizedScores[Number(key)] = allScores[key];
    }
  }
  return calculateScoreLogic(normalizedScores, participantBonusOverride);
};

/**
 * Calculates the final score for a single jury's evaluation of a participant.
 * Returns: average of question scores (bonus tracked separately for display)
 */
export const calculateSingleJuryEvaluationScore = (
  allScores: { [questionNumber: number]: QuestionFields },
  participantBonusOverride?: number // Participant-level overall bonus (0-5 points)
): CalculatedScoreResult => {
  return calculateScoreLogic(allScores, participantBonusOverride);
};

/**
 * Get the penalty/bonus string for each score field type.
 * Returns a formatted string for display.
 */
export const getErrorPenalty = (errorType: keyof QuestionFields): string => {
  const penalties: Record<keyof QuestionFields, string> = {
    hifdh_judge_correction: `-${HIFDH_JUDGE_CORRECTION_PENALTY} pts`,
    hifdh_self_correction: `-${HIFDH_SELF_CORRECTION_PENALTY} pts`,
    hifdh_stuck_count: "Info", // Informational
    tajweed_major: `-${TAJWEED_MAJOR_PENALTY} pts`,
    tajweed_minor: `-${TAJWEED_MINOR_PENALTY} pts`,
    waqf_ibtida_incorrect: `-${WAQF_IBTIDA_INCORRECT_PENALTY} pts`,
    waqf_ibtida_meaning: `-${WAQF_IBTIDA_MEANING_PENALTY} pts`,
    husn_al_ada_score: `-${HUSN_AL_ADA_MISTAKE_PENALTY} pt / mistake`, // husn_al_ada_score is count of mistakes
    // overall_bonus removed as it's no longer part of QuestionFields
  };

  return penalties[errorType] || "";
};

/**
 * Get section weight/contribution for display.
 * Indicates maximum point contribution or deduction for each section.
 */
export const getSectionWeight = (
  section: "hifdh" | "tajweed" | "waqf" | "husn_al_ada" | "overall_bonus"
): string => {
  const weights: Record<string, string> = {
    hifdh: `Max ${MAX_HIFDH_DEDUCTION} pts deduction`,
    tajweed: `Max ${MAX_TAJWEED_DEDUCTION} pts deduction`,
    waqf: `Max ${MAX_WAQF_IBTIDA_DEDUCTION} pts deduction`,
    husn_al_ada: `Max ${MAX_HUSN_AL_ADA_DEDUCTION} pts deduction`, // Max deduction for Husn Al-Ada
    overall_bonus: `+${TOTAL_OVERALL_BONUS_CAP} pts (participant total)`, // Updated to reflect participant-level bonus
  };

  return weights[section] || "";
};

// Helper function to process raw scores from Firestore for a single participant
// and calculate the average score from multiple juries.
export const calculateJuryAverageScore = (
  participantRawScores: RawScoreData[] // This is an array of ALL score documents for a participant
): (CalculatedScoreResult & { juryCount: number }) | null => {
  if (!participantRawScores || participantRawScores.length === 0) {
    return null;
  }

  // Group scores by juryId
  const scoresByJury: {
    [juryId: string]: { [questionNumber: number]: QuestionFields };
  } = {};
  participantRawScores.forEach((rawScore) => {
    if (!scoresByJury[rawScore.juryId]) {
      scoresByJury[rawScore.juryId] = {};
    }
    // Ensure scores are complete, fill with defaults if necessary
    scoresByJury[rawScore.juryId][rawScore.questionNumber] = {
      ...defaultScores, // Start with defaults
      ...rawScore.scores, // Override with actual scores
    };
  });

  const juryIds = Object.keys(scoresByJury);
  if (juryIds.length === 0) {
    return {
      percentage: 0,
      breakdownBySection: {
        hifdh: 0,
        tajweed: 0,
        waqf: 0,
        husn_al_ada: 0,
        overall_bonus: 0,
      },
      juryCount: 0,
    };
  }

  let totalPercentageSum = 0;
  const aggregateBreakdown: ScoreBreakdown = {
    hifdh: 0,
    tajweed: 0,
    waqf: 0,
    husn_al_ada: 0,
    overall_bonus: 0, // This will be the capped bonus from one of the jury calculations, then averaged.
    // Or, more accurately, average the final percentages that already include the bonus.
  };

  let totalOverallBonusApplied = 0; // Sum of capped bonuses applied by each jury

  juryIds.forEach((juryId) => {
    const juryScores = scoresByJury[juryId];
    // Calculate score for this specific jury
    const juryResult = calculateSingleJuryEvaluationScore(juryScores);
    totalPercentageSum += juryResult.percentage;

    // Sum up breakdown components for averaging
    aggregateBreakdown.hifdh += juryResult.breakdownBySection.hifdh;
    aggregateBreakdown.tajweed += juryResult.breakdownBySection.tajweed;
    aggregateBreakdown.waqf += juryResult.breakdownBySection.waqf;
    aggregateBreakdown.husn_al_ada += juryResult.breakdownBySection.husn_al_ada; // Sum of average deductions
    // The `overall_bonus` in `juryResult.breakdownBySection` is the capped bonus for *that jury's set of questions*.
    // We need to average these capped bonuses.
    totalOverallBonusApplied += juryResult.breakdownBySection.overall_bonus;
  });

  const juryCount = juryIds.length;
  const averagePercentage = totalPercentageSum / juryCount;

  const averageBreakdown: ScoreBreakdown = {
    hifdh: Math.round((aggregateBreakdown.hifdh / juryCount) * 100) / 100,
    tajweed: Math.round((aggregateBreakdown.tajweed / juryCount) * 100) / 100,
    waqf: Math.round((aggregateBreakdown.waqf / juryCount) * 100) / 100,
    husn_al_ada:
      Math.round((aggregateBreakdown.husn_al_ada / juryCount) * 100) / 100, // Average of average deductions
    overall_bonus:
      Math.round((totalOverallBonusApplied / juryCount) * 100) / 100, // Average of bonuses applied by each jury
  };

  const maxPossibleScore = BASE_SCORE_PER_QUESTION + TOTAL_OVERALL_BONUS_CAP;

  return {
    percentage: Math.max(
      0,
      Math.min(maxPossibleScore, Math.round(averagePercentage * 100) / 100)
    ),
    breakdownBySection: averageBreakdown,
    juryCount: juryCount,
  };
};

/**
 * Checks if a participant has any scores recorded.
 * @param participantRawScores Array of raw score data for the participant.
 * @returns True if scores exist, false otherwise.
 */
export const hasScores = (participantRawScores: RawScoreData[]): boolean => {
  return participantRawScores && participantRawScores.length > 0;
};
