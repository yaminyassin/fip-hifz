import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  onSnapshot,
  query,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { firestore } from "@/main";
import { Participant, QuestionFields, OverallBonus } from "@/models/models";
import { useEffect, useRef } from "react";
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
  overallBonuses: Record<string, number>; // juryId -> overallBonus value
};

export const useParticipants = () => {
  const queryClient = useQueryClient();
  // Use refs to store the latest participants data for score processing
  const participantsRef = useRef<ParticipantWithScores[]>([]);

  // Helper function to process scores with the latest participants data
  const processScoresWithLatestParticipants = (
    scoresSnapshot: QuerySnapshot<DocumentData>
  ) => {
    const currentParticipants = participantsRef.current;
    if (!currentParticipants.length) return;

    // Create a map for faster lookups
    const scoresMap = new Map<string, ExtendedScores[]>();

    scoresSnapshot.docs.forEach((scoreDoc) => {
      const scoreData = scoreDoc.data() as ExtendedScores;
      if (!scoreData.scores) return;

      const participantScores = scoresMap.get(scoreData.participantId) || [];
      participantScores.push(scoreData);
      scoresMap.set(scoreData.participantId, participantScores);
    });

    // Update participants with their scores
    const updatedParticipants = currentParticipants.map((participant) => {
      const participantScores = scoresMap.get(participant.id) || [];

      // Group scores by jury
      const scoresByJury: Record<
        string,
        { [questionNumber: number]: QuestionFields }
      > = {};
      const allJuryIds: string[] = [];

      // Process scores for this participant
      participantScores.forEach((scoreData) => {
        const { juryId, questionNumber, scores, pageNumber } = scoreData;

        // Initialize jury scores object if needed
        if (!scoresByJury[juryId]) {
          scoresByJury[juryId] = {};
          allJuryIds.push(juryId);
        }

        // Map page number to question number
        const actualPage = pageNumber !== undefined ? pageNumber : questionNumber;
        const questionIndex = participant.assignedQuestions.indexOf(actualPage);

        // Only include scores for questions that are still assigned to this participant
        if (questionIndex !== -1) {
          const mappedQuestionNumber = questionIndex + 1;

          // Initialize question fields if needed
          if (!scoresByJury[juryId][mappedQuestionNumber]) {
            scoresByJury[juryId][mappedQuestionNumber] = createEmptyQuestionFields();
          }

          // Merge in the scores
          Object.keys(scores).forEach((field) => {
            const fieldKey = field as keyof QuestionFields;
            if (typeof scores[fieldKey] === "number") {
              scoresByJury[juryId][mappedQuestionNumber][fieldKey] = scores[fieldKey];
            }
          });
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
    participantsRef.current = updatedParticipants;
  };

  // Helper function to process overall bonuses
  const processOverallBonusesWithLatestParticipants = (
    overallBonusesSnapshot: QuerySnapshot<DocumentData>
  ) => {
    const currentParticipants = participantsRef.current;
    if (!currentParticipants.length) return;

    // Create a map for faster lookups
    const bonusesMap = new Map<string, Record<string, number>>();

    overallBonusesSnapshot.docs.forEach((bonusDoc) => {
      const bonusData = bonusDoc.data() as OverallBonus;
      const participantBonuses = bonusesMap.get(bonusData.participantId) || {};
      participantBonuses[bonusData.juryId] = bonusData.overallBonus;
      bonusesMap.set(bonusData.participantId, participantBonuses);
    });

    // Update participants with their overall bonuses
    const updatedParticipants = currentParticipants.map((participant) => {
      const overallBonuses = bonusesMap.get(participant.id) || {};

      return {
        ...participant,
        overallBonuses,
      };
    });

    // Update React Query cache with the updated overall bonuses
    queryClient.setQueryData(["participants"], updatedParticipants);
    participantsRef.current = updatedParticipants;
  };

  useEffect(() => {
    // Set up real-time listener for participants
    const participantsCollection = collection(firestore, "participants");
    const participantsUnsubscribe = onSnapshot(
      participantsCollection,
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
            overallBonuses: {},
          } as ParticipantWithScores;
        });

        // Update React Query cache and ref with the participants data
        queryClient.setQueryData(["participants"], participants);
        participantsRef.current = participants;
      },
      (error) => {
        console.error("Error in participants listener:", error);
      }
    );

    // Set up separate real-time listener for scores
    const scoresRef = collection(firestore, "scores");
    const scoresQuery = query(scoresRef);
    const scoresUnsubscribe = onSnapshot(
      scoresQuery,
      processScoresWithLatestParticipants,
      (error) => {
        console.error("Error in scores listener:", error);
      }
    );

    // Set up separate real-time listener for overall bonuses
    const overallBonusesRef = collection(firestore, "overallBonuses");
    const overallBonusesQuery = query(overallBonusesRef);
    const overallBonusesUnsubscribe = onSnapshot(
      overallBonusesQuery,
      processOverallBonusesWithLatestParticipants,
      (error) => {
        console.error("Error in overall bonuses listener:", error);
      }
    );

    // Cleanup function
    return () => {
      participantsUnsubscribe();
      scoresUnsubscribe();
      overallBonusesUnsubscribe();
    };
  }, [queryClient]);

  return useQuery<ParticipantWithScores[]>({
    queryKey: ["participants"],
    queryFn: () => participantsRef.current || [], // Return current value from ref
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};
