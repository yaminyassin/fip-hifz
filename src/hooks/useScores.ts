import { useQuery } from "@tanstack/react-query";
import { getScoresForParticipantQuestion } from "../services/scores";
import { useEvent } from "../contexts/EventContext";

export const useScores = ({
  juryId,
  participantId,
  questionNumber,
}: {
  juryId: string;
  participantId?: string;
  questionNumber: number;
}) => {
  const { currentEvent } = useEvent();
  
  return useQuery({
    queryKey: ["scores", currentEvent, juryId, participantId, questionNumber],
    queryFn: () =>
      getScoresForParticipantQuestion(currentEvent || 'lisbon-2025', juryId, participantId!, questionNumber),
    enabled: !!juryId && !!participantId && questionNumber > 0,
  });
};
