import { QuestionFields } from "@/models/models";

// Mapping of juz numbers to page ranges
export const juzToPageMap: Record<number, { start: number; end: number }> = {
  1: { start: 3, end: 21 },
  2: { start: 22, end: 41 },
  2.5: { start: 42, end: 53 },
  3: { start: 42, end: 61 },
  4: { start: 62, end: 81 },
  5: { start: 82, end: 101 },
  6: { start: 102, end: 121 },
  7: { start: 122, end: 141 },
  8: { start: 142, end: 161 },
  9: { start: 162, end: 181 },
  10: { start: 182, end: 201 },
  11: { start: 202, end: 221 },
  12: { start: 222, end: 241 },
  13: { start: 242, end: 261 },
  14: { start: 262, end: 281 },
  15: { start: 282, end: 301 },
  16: { start: 302, end: 321 },
  17: { start: 322, end: 341 },
  18: { start: 342, end: 361 },
  19: { start: 362, end: 381 },
  20: { start: 382, end: 401 },
  21: { start: 402, end: 421 },
  22: { start: 422, end: 441 },
  23: { start: 442, end: 461 },
  24: { start: 462, end: 481 },
  25: { start: 482, end: 501 },
  26: { start: 502, end: 521 },
  27: { start: 522, end: 541 },
  28: { start: 542, end: 561 },
  29: { start: 562, end: 581 },
  30: { start: 582, end: 596 },
};

// Category definitions
export type CategoryConfig = {
  numQuestions: number;
  questionRanges: Array<{
    name: string;
    juzRange: [number, number];
    numParts: number;
  }>;
};

export const categoryConfigs: Record<string, CategoryConfig> = {
  A: {
    numQuestions: 2,
    questionRanges: [
      { name: "A1", juzRange: [1, 5], numParts: 2 },
      { name: "A2", juzRange: [26, 30], numParts: 2 },
    ],
  },
  B: {
    numQuestions: 2,
    questionRanges: [
      { name: "B1", juzRange: [1, 10], numParts: 2 },
      { name: "B2", juzRange: [21, 30], numParts: 2 },
    ],
  },
  C: {
    numQuestions: 3,
    questionRanges: [
      { name: "C1", juzRange: [1, 20], numParts: 3 },
      { name: "C2", juzRange: [11, 30], numParts: 3 },
    ],
  },
  D: {
    numQuestions: 3,
    questionRanges: [
      { name: "D1", juzRange: [1, 30], numParts: 3 },
      { name: "D2", juzRange: [1, 30], numParts: 3 },
    ],
  },
  M: {
    numQuestions: 2,
    questionRanges: [
      { name: "M1", juzRange: [30, 30], numParts: 2 },
      { name: "M2", juzRange: [28, 28], numParts: 2 },
    ],
  },
  X: {
    numQuestions: 2,
    questionRanges: [{ name: "X", juzRange: [1, 2.5], numParts: 2 }],
  },
  Y: {
    numQuestions: 3,
    questionRanges: [{ name: "Y", juzRange: [1, 15], numParts: 3 }],
  },
  W: {
    numQuestions: 3,
    questionRanges: [
      { name: "W1", juzRange: [1, 3], numParts: 3 },
      { name: "W2", juzRange: [1, 30], numParts: 3 },
    ],
  },
};

// Get a random page from a juz range
export const getRandomPageFromJuzRange = (
  startJuz: number,
  endJuz: number,
  partIndex: number,
  totalParts: number,
  excludedPages: number[] = []
): number => {
  // Calculate the total page range
  const startPage = juzToPageMap[startJuz].start;
  const endPage = juzToPageMap[endJuz].end;
  const totalPages = endPage - startPage + 1;

  // Calculate the part size and range
  const partSize = Math.floor(totalPages / totalParts);
  const partStartPage = startPage + partIndex * partSize;
  const partEndPage =
    partIndex === totalParts - 1 ? endPage : partStartPage + partSize - 1;

  // Create array of available pages (excluding the ones in excludedPages)
  const availablePages: number[] = [];
  for (let page = partStartPage; page <= partEndPage; page++) {
    if (!excludedPages.includes(page)) {
      availablePages.push(page);
    }
  }

  // If no pages are available (all are excluded), fall back to original behavior
  if (availablePages.length === 0) {
    console.warn(
      `All pages in range ${partStartPage}-${partEndPage} are excluded. Falling back to random selection.`
    );
    return (
      Math.floor(Math.random() * (partEndPage - partStartPage + 1)) +
      partStartPage
    );
  }

  // Return a random page from available pages
  const randomIndex = Math.floor(Math.random() * availablePages.length);
  return availablePages[randomIndex];
};

// Get the category configuration for a participant
export const getCategoryConfig = (category: string): CategoryConfig => {
  // Handle subcategories by extracting the main category (first character)
  const mainCategory = category.charAt(0).toUpperCase();

  // Check if the main category exists in our configs
  if (categoryConfigs[mainCategory]) {
    return categoryConfigs[mainCategory];
  }

  // Default to category A if the category is not found
  return categoryConfigs.A;
};

// Get the question configuration for a specific question index
export const getQuestionConfig = (
  category: string,
  questionIndex: number
): { juzRange: [number, number]; partIndex: number; totalParts: number } => {
  const config = getCategoryConfig(category);

  // Calculate which range this question belongs to
  let currentRangeIndex = 0;
  let questionCounter = 0;

  for (const range of config.questionRanges) {
    const questionsInRange = range.numParts;

    if (questionIndex < questionCounter + questionsInRange) {
      const partIndex = questionIndex - questionCounter;
      return {
        juzRange: range.juzRange,
        partIndex,
        totalParts: range.numParts,
      };
    }

    questionCounter += questionsInRange;
    currentRangeIndex++;

    // If we've gone through all ranges, wrap around to the first range
    if (currentRangeIndex >= config.questionRanges.length) {
      currentRangeIndex = 0;
    }
  }

  // Default fallback (should not reach here if configuration is correct)
  return {
    juzRange: [1, 30],
    partIndex: 0,
    totalParts: config.numQuestions,
  };
};

// Generate a random page for a specific question
export const generateRandomPage = (
  category: string,
  questionIndex: number,
  excludedPages: number[] = []
): number => {
  // Get the main category configuration
  const mainCategory = category.charAt(0).toUpperCase();
  const config = getCategoryConfig(mainCategory);

  // Determine which subcategory to use based on the participant's category
  // If the category includes a number (like C1, C2), use that to select the range
  let rangeIndex = 0;
  if (category.length > 1) {
    const subcategoryNum = parseInt(category.substring(1), 10);
    if (
      !isNaN(subcategoryNum) &&
      subcategoryNum > 0 &&
      subcategoryNum <= config.questionRanges.length
    ) {
      rangeIndex = subcategoryNum - 1;
    }
  }

  // Get the selected range
  const selectedRange = config.questionRanges[rangeIndex];

  // Calculate the part index within the selected range
  const partIndex = questionIndex % selectedRange.numParts;

  // Generate a random page from the selected range and part
  return getRandomPageFromJuzRange(
    selectedRange.juzRange[0],
    selectedRange.juzRange[1],
    partIndex,
    selectedRange.numParts,
    excludedPages
  );
};

// Helper function to create perfect question scores (100 points)
export const createPerfectQuestionScore = (): QuestionFields => ({
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
export const fillMissingQuestionsWithPerfectScores = (
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
export const fillMissingQuestionsAndCalculateAverage = (
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
