import { useQuery } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { firestore } from "@/main";
import { QuestionFields, Scores } from "@/models/models";

const defaultScores: QuestionFields = {
  hifz_fath: 0,
  hifz_tannin: 0,
  hifz_taraddud: 0,
  tajweed_jali: 0,
  tajweed_khafi: 0,
  waqf_ibtida: 0,
  fluency_bonus: 0,
};

export const useJuryScores = (
  juryId: string,
  participantId?: string,
  questionNumber?: number
) => {
  // const queryClient = useQueryClient();

  return useQuery<QuestionFields>({
    queryKey: ["juryScores", juryId, participantId, questionNumber],
    queryFn: async () => {
      if (!participantId || !questionNumber) {
        return defaultScores;
      }

      const scoresRef = collection(firestore, "scores");
      const q = query(
        scoresRef,
        where("juryId", "==", juryId),
        where("participantId", "==", participantId),
        where("questionNumber", "==", questionNumber)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return defaultScores;
      }

      const scoreDoc = snapshot.docs[0];
      const scoreData = scoreDoc.data() as Scores;

      // Only return scores if this question has been evaluated
      if (
        !scoreData.scores ||
        Object.values(scoreData.scores).every((score) => score === 0)
      ) {
        return defaultScores;
      }

      return scoreData.scores;
    },
    staleTime: Infinity, // Only update when explicitly invalidated
  });
};
