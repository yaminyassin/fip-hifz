import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot, query } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant, QuestionFields } from "@/models/models";
import { useEffect } from "react";

type ParticipantWithScores = Participant & {
  questionScores: {
    [key: number]: QuestionFields;
  };
};

export const useParticipants = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Set up real-time listener for participants
    const participantsRef = collection(firestore, "participants");
    const participantsUnsubscribe = onSnapshot(participantsRef, (participantsSnapshot) => {
      const participants = participantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        questionScores: {},
      } as ParticipantWithScores));

      // Update React Query cache with the participants data
      queryClient.setQueryData(["participants"], participants);

      // Set up real-time listener for scores
      const scoresRef = collection(firestore, "scores");
      const scoresQuery = query(scoresRef);

      const scoresUnsubscribe = onSnapshot(scoresQuery, (scoresSnapshot) => {
        // Get current participants from cache
        const currentParticipants = queryClient.getQueryData<ParticipantWithScores[]>(["participants"]) || [];

        // Create a new array with updated scores
        const updatedParticipants = currentParticipants.map(participant => {
          const questionScores: { [key: number]: QuestionFields } = {};

          participant.assignedQuestions.forEach((questionNumber, index) => {
            const mappedQuestionNumber = index + 1;
            const questionScore: QuestionFields = {
              hifz_reminder: 0,
              hifz_assistance: 0,
              tajweed_minor: 0,
              tajweed_major: 0,
              fluency: 0,
            };

            // Find scores for this participant and question
            scoresSnapshot.docs.forEach((scoreDoc) => {
              const scoreData = scoreDoc.data();
              if (
                scoreData.participantId === participant.id &&
                scoreData.questionNumber === mappedQuestionNumber
              ) {
                Object.keys(scoreData.scores).forEach((field) => {
                  if (typeof scoreData.scores[field] === 'number') {
                    questionScore[field as keyof QuestionFields] = scoreData.scores[field];
                  }
                });
              }
            });

            questionScores[mappedQuestionNumber] = questionScore;
          });

          return {
            ...participant,
            questionScores,
          };
        });

        // Update React Query cache with the updated scores
        queryClient.setQueryData(["participants"], updatedParticipants);
      });

      return () => scoresUnsubscribe();
    });

    return () => participantsUnsubscribe();
  }, [queryClient]);

  return useQuery<ParticipantWithScores[]>({
    queryKey: ["participants"],
    queryFn: () => [], // Initial value, will be updated by the listener
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
  });
};
