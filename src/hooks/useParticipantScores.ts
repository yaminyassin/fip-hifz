import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Scores, QuestionFields } from "@/models/models";
import { useEffect } from "react";

// Helper function to create an empty QuestionFields object
export const createEmptyQuestionFields = (): QuestionFields => ({
  // Hifdh
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0,
  // Tajweed
  tajweed_major: 0,
  tajweed_minor: 0,
  // Waqf & Ibtida
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  // Husn al-Ada
  husn_al_ada_score: 0,
  // Overall bonus is now in separate collection
});

// Helper function to calculate average scores across jury members
export const calculateAverageScores = (
  juryScores: Record<string, { [questionNumber: number]: QuestionFields }>
): { [questionNumber: number]: QuestionFields } => {
  const averageScores: { [questionNumber: number]: QuestionFields } = {};
  const juryIds = Object.keys(juryScores);

  if (juryIds.length === 0) {
    return averageScores;
  }

  // Find all question numbers across all juries
  const allQuestionNumbers = new Set<number>();
  juryIds.forEach((juryId) => {
    Object.keys(juryScores[juryId]).forEach((qNum) => {
      allQuestionNumbers.add(Number(qNum));
    });
  });

  // Calculate average for each question and field
  allQuestionNumbers.forEach((questionNumber) => {
    averageScores[questionNumber] = createEmptyQuestionFields();

    // Count how many juries evaluated this question
    let juryCount = 0;

    // Sum up scores for this question from all juries
    juryIds.forEach((juryId) => {
      const juryQuestionScore = juryScores[juryId][questionNumber];
      if (juryQuestionScore) {
        juryCount++;
        Object.keys(juryQuestionScore).forEach((field) => {
          const fieldKey = field as keyof QuestionFields;
          averageScores[questionNumber][fieldKey] +=
            juryQuestionScore[fieldKey];
        });
      }
    });

    // Calculate average for each field if we have juries that scored this question
    if (juryCount > 0) {
      Object.keys(averageScores[questionNumber]).forEach((field) => {
        const fieldKey = field as keyof QuestionFields;
        averageScores[questionNumber][fieldKey] =
          averageScores[questionNumber][fieldKey] / juryCount;
      });
    }
  });

  return averageScores;
};

export const useParticipantScores = (
  participantId: string,
  questionNumber?: number
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!participantId) return;

    const scoresRef = collection(firestore, "scores");
    const constraints = [where("participantId", "==", participantId)];

    if (questionNumber) {
      constraints.push(where("questionNumber", "==", questionNumber));
    }

    const q = query(scoresRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        // Group scores by jury
        const scoresByJury: Record<
          string,
          { [questionNumber: number]: QuestionFields }
        > = {};
        const allJuryIds: string[] = [];

        querySnapshot.forEach((doc) => {
          const scoreData = { id: doc.id, ...doc.data() } as Scores;
          const { juryId, questionNumber, scores } = scoreData;

          // Initialize jury scores object if needed
          if (!scoresByJury[juryId]) {
            scoresByJury[juryId] = {};
            allJuryIds.push(juryId);
          }

          // Store scores for this jury and question
          scoresByJury[juryId][questionNumber] = scores;
        });

        // Calculate average scores across all juries
        const averageScores = calculateAverageScores(scoresByJury);

        const result = {
          byJury: scoresByJury,
          average: averageScores,
          juryIds: allJuryIds,
        };

        const queryKey = questionNumber
          ? ["scores", participantId, questionNumber]
          : ["scores", participantId];

        queryClient.setQueryData(queryKey, result);
      },
      (error) => {
        console.error("Error fetching scores:", error);
      }
    );

    return () => unsubscribe();
  }, [participantId, questionNumber, queryClient]);

  // Initialize with empty objects to avoid null/undefined errors
  const emptyResult = {
    byJury: {} as Record<string, { [questionNumber: number]: QuestionFields }>,
    average: {} as { [questionNumber: number]: QuestionFields },
    juryIds: [] as string[],
  };

  return useQuery({
    queryKey: questionNumber
      ? ["scores", participantId, questionNumber]
      : ["scores", participantId],
    queryFn: () => emptyResult, // Initial value with proper typing
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
    enabled: !!participantId,
  });
};
