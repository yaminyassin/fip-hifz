import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, QuerySnapshot, DocumentData } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useFirestoreListener } from "./useFirestoreListener";
import { useMemo } from "react";

export const useActiveParticipant = () => {
  const queryClient = useQueryClient();

  // Memoize the query to prevent recreation on every render
  const participantQuery = useMemo(() => {
    const participantsRef = collection(firestore, "participants");
    return query(participantsRef, where("isActive", "==", true));
  }, []);

  // Use centralized listener
  useFirestoreListener<QuerySnapshot<DocumentData>>({
    query: participantQuery,
    key: "activeParticipant",
    onData: (querySnapshot) => {
      if (!querySnapshot.empty) {
        const activeParticipant = {
          id: querySnapshot.docs[0].id,
          ...querySnapshot.docs[0].data(),
        } as Participant;
        // console.log(`[useActiveParticipant] Setting active participant:`, activeParticipant.name);
        queryClient.setQueryData(["activeParticipant"], activeParticipant);
      } else {
        // console.log(`[useActiveParticipant] No active participant found`);
        queryClient.setQueryData(["activeParticipant"], null);
      }
    },
    onError: (error) => {
      console.error("Error fetching active participant:", error);
    },
  });

  return useQuery<Participant | null>({
    queryKey: ["activeParticipant"],
    queryFn: () => {
      // Return current value from cache or null
      return queryClient.getQueryData<Participant | null>(["activeParticipant"]) || null;
    },
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};
