import { useQuery } from "@tanstack/react-query";
import { getCurrentParticipantFromFirestore } from "@/services/getCurrentParticipant";

export const useActiveParticipant = () => {
  return useQuery({
    queryKey: ["activeParticipant"],
    queryFn: getCurrentParticipantFromFirestore,
    staleTime: 1000 * 60, // Consider data fresh for 1 minute
  });
}; 