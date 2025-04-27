import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot, query } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant, QuestionFields } from "@/models/models";
import { useEffect } from "react";
import {
  calculateAverageScores,
  createEmptyQuestionFields,
} from "./useParticipantScores";

// Extended Scores type with pageNumber
interface ExtendedScores {
  id: string;
  participantId: string;
  juryId: string;
  questionNumber: number;
  pageNumber?: number;
  scores: QuestionFields;
}

// Export the type so it can be used elsewhere
export type ParticipantWithScores = Participant & {
  questionScores: {
    byJury: Record<string, { [questionNumber: number]: QuestionFields }>;
    average: { [questionNumber: number]: QuestionFields };
    juryIds: string[];
  };
};

export const useParticipants = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Set up real-time listener for participants
    const participantsRef = collection(firestore, "participants");
    const participantsUnsubscribe = onSnapshot(
      participantsRef,
      (participantsSnapshot) => {
        const participants = participantsSnapshot.docs.map((doc) => {
          const participantData = doc.data() as Omit<Participant, "id">;
          return {
            id: doc.id,
            ...participantData,
            questionScores: {
              byJury: {},
              average: {},
              juryIds: [],
            },
          } as ParticipantWithScores;
        });

        // Update React Query cache with the participants data
        queryClient.setQueryData(["participants"], participants);

        // Set up real-time listener for scores
        const scoresRef = collection(firestore, "scores");
        const scoresQuery = query(scoresRef);

        const scoresUnsubscribe = onSnapshot(scoresQuery, (scoresSnapshot) => {
          // Get current participants from cache
          const currentParticipants =
            queryClient.getQueryData<ParticipantWithScores[]>([
              "participants",
            ]) || [];

          // Create a new array with updated scores
          const updatedParticipants = currentParticipants.map((participant) => {
            // Group scores by jury
            const scoresByJury: Record<
              string,
              { [questionNumber: number]: QuestionFields }
            > = {};
            const allJuryIds: string[] = [];

            // Process scores for this participant
            scoresSnapshot.docs.forEach((scoreDoc) => {
              const scoreData = scoreDoc.data() as ExtendedScores;

              if (
                scoreData.participantId === participant.id &&
                scoreData.scores
              ) {
                const { juryId, questionNumber, scores } = scoreData;

                // Initialize jury scores object if needed
                if (!scoresByJury[juryId]) {
                  scoresByJury[juryId] = {};
                  allJuryIds.push(juryId);
                }

                // Make sure we have all question numbers initialized
                // Some scores might use the new pageNumber field, others might use questionNumber
                const actualPage =
                  scoreData.pageNumber !== undefined
                    ? scoreData.pageNumber
                    : questionNumber;
                const questionIndex =
                  participant.assignedQuestions.indexOf(actualPage);

                // Only include scores for questions that are still assigned to this participant
                if (questionIndex !== -1) {
                  const mappedQuestionNumber = questionIndex + 1;

                  // Store scores for this jury and question
                  if (!scoresByJury[juryId][mappedQuestionNumber]) {
                    scoresByJury[juryId][mappedQuestionNumber] =
                      createEmptyQuestionFields();
                  }

                  // Merge in the scores
                  Object.keys(scores).forEach((field) => {
                    const fieldKey = field as keyof QuestionFields;
                    if (typeof scores[fieldKey] === "number") {
                      scoresByJury[juryId][mappedQuestionNumber][fieldKey] =
                        scores[fieldKey];
                    }
                  });
                }
              }
            });

            // Calculate average scores across all juries
            const averageScores = calculateAverageScores(scoresByJury);

            return {
              ...participant,
              questionScores: {
                byJury: scoresByJury,
                average: averageScores,
                juryIds: allJuryIds,
              },
            };
          });

          // Update React Query cache with the updated scores
          queryClient.setQueryData(["participants"], updatedParticipants);
        });

        return () => scoresUnsubscribe();
      }
    );

    return () => participantsUnsubscribe();
  }, [queryClient]);

  return useQuery<ParticipantWithScores[]>({
    queryKey: ["participants"],
    queryFn: () => [], // Initial value, will be updated by the listener
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
  });
};
