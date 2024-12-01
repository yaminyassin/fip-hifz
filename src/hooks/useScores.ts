import { firestore } from "@/main";
import { Record } from "@/models/models";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";

export const useScores = (
  participantId: string,
  juryId: string,
  question: number
) => {
  return useQuery({
    queryKey: ["scores", participantId, juryId, question],
    queryFn: async () => {
      const recordRef = doc(
        firestore,
        "records",
        `${participantId}_${juryId}_${question}`
      );
      const record = await getDoc(recordRef);
      return record.exists() ? (record.data() as Record) : null;
    },
  });
};
