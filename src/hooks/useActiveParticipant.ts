import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useEffect } from "react";

export const useActiveParticipant = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const participantsRef = collection(firestore, "participants");
    const q = query(participantsRef, where("isActive", "==", true));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      if (!querySnapshot.empty) {
        const activeParticipant = {
          id: querySnapshot.docs[0].id,
          ...querySnapshot.docs[0].data()
        } as Participant;
        queryClient.setQueryData(["activeParticipant"], activeParticipant);
      } else {
        queryClient.setQueryData(["activeParticipant"], null);
      }
    }, (error) => {
      console.error("Error fetching active participant:", error);
    });

    return () => unsubscribe();
  }, [queryClient]);

  return useQuery<Participant | null>({
    queryKey: ["activeParticipant"],
    queryFn: () => null, // Initial value, will be updated by the listener
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
  });
};
