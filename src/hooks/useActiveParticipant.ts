import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, QuerySnapshot, DocumentData } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useFirestoreListener } from "./useFirestoreListener";
import { useMemo } from "react";
import { useEvent } from "@/contexts/EventContext";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import { LISTENER_ERROR_KEY } from "./useParticipants";

/**
 * The single listener behind /jury, /big-screen, /quran-page, /randomizer and
 * /randomizer-audience. A Firestore `onSnapshot` error is terminal, so before
 * this reported anywhere the whole hall's screens would simply freeze on the
 * previous participant with no indication anything was wrong. The error is
 * published into the shared `LISTENER_ERROR_KEY` slot read by
 * `useParticipantsListenerError`, which routes render as an in-layout banner
 * (a toast is suppressed on the audience routes — its viewport sits in the
 * middle of the projector).
 */
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
      queryClient.setQueryData([LISTENER_ERROR_KEY, currentEvent], null);
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
      queryClient.setQueryData(
        [LISTENER_ERROR_KEY, currentEvent],
        error?.message ?? "active participant listener error"
      );
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
