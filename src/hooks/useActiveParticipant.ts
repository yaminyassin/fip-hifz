import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, QuerySnapshot, DocumentData } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useFirestoreListener } from "./useFirestoreListener";
import { useMemo } from "react";
import { useEvent } from "@/contexts/EventContext";
import { getEventCollectionPath } from "@/utils/firebaseUtils";

export const useActiveParticipant = () => {
  const queryClient = useQueryClient();
  const { currentEvent } = useEvent();

  // Memoize the query to prevent recreation on every render
  const participantQuery = useMemo(() => {
    if (!currentEvent) return null;
    const participantsRef = collection(firestore, getEventCollectionPath(currentEvent, "participants"));
    return query(participantsRef, where("isActive", "==", true));
  }, [currentEvent]);

  // Use centralized listener
  useFirestoreListener<QuerySnapshot<DocumentData>>({
    query: participantQuery,
    key: `activeParticipant-${currentEvent}`,
    onData: (querySnapshot) => {
      if (!querySnapshot.empty) {
        const activeParticipant = {
          id: querySnapshot.docs[0].id,
          ...querySnapshot.docs[0].data(),
        } as Participant;
        queryClient.setQueryData(["activeParticipant", currentEvent], activeParticipant);
      } else {
        queryClient.setQueryData(["activeParticipant", currentEvent], null);
      }
    },
    onError: (error) => {
      console.error("Error fetching active participant:", error);
    },
    enabled: !!participantQuery,
  });

  return useQuery<Participant | null>({
    queryKey: ["activeParticipant", currentEvent],
    queryFn: () => {
      // Return current value from cache or null
      return queryClient.getQueryData<Participant | null>(["activeParticipant", currentEvent]) || null;
    },
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!currentEvent,
  });
};
