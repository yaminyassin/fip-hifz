import { firestore } from "@/main";
import { Participant, QuestionFields } from "@/models/models";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";

type ParticipantWithScores = Participant & {
  questionScores: {
    [key: number]: QuestionFields;
  };
};

export const useParticipants = () => {
  return useQuery({
    queryKey: ["participants"],
    queryFn: async () => {
      const participantsRef = collection(firestore, "participants");
      const participantsSnapshot = await getDocs(participantsRef);

      const participants: ParticipantWithScores[] = [];

      for (const doc of participantsSnapshot.docs) {
        const participant = doc.data() as Participant;
        const questionScores: { [key: number]: QuestionFields } = {};

        // Fetch scores for each assigned question
        for (const questionNumber of participant.assignedQuestions) {
          const scoresRef = collection(firestore, "scores");
          const scoresSnapshot = await getDocs(scoresRef);

          const questionScore: QuestionFields = {
            hifz_reminder: 0,
            hifz_assitance: 0,
            tajweed_minor: 0,
            tajweed_major: 0,
            fluency: 0,
          };

          scoresSnapshot.docs.forEach((scoreDoc) => {
            const scoreData = scoreDoc.data();
            if (
              scoreData.participantId === participant.id &&
              scoreData.questionNumber === questionNumber
            ) {
              Object.keys(scoreData.scores).forEach((field) => {
                questionScore[field as keyof QuestionFields] +=
                  scoreData.scores[field];
              });
            }
          });

          questionScores[questionNumber] = questionScore;
        }

        participants.push({
          ...participant,
          questionScores,
        });
      }

      return participants;
    },
  });
};
