import { useQuery } from "@tanstack/react-query";
import { getScoresForParticipantQuestion } from "../services/scores";

export const useScores = ({
  juryId,
  participantId,
  questionNumber,
}: {
  juryId: string;
  participantId?: string;
  questionNumber: number;
}) => {
  return useQuery({
    queryKey: ["scores", juryId, participantId, questionNumber],
    queryFn: () =>
      getScoresForParticipantQuestion(juryId, participantId, questionNumber),
  });
};
