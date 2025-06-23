import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, QuerySnapshot, DocumentData } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { useFirestoreListener } from "./useFirestoreListener";

export const useActiveParticipant = () => {
  const queryClient = useQueryClient();

  // Create the query
  const participantsRef = collection(firestore, "participants");
  const q = query(participantsRef, where("isActive", "==", true));

  // Use centralized listener
  useFirestoreListener<QuerySnapshot<DocumentData>>({
    query: q,
    key: "activeParticipant",
    onData: (querySnapshot) => {
      if (!querySnapshot.empty) {
        const activeParticipant = {
          id: querySnapshot.docs[0].id,
          ...querySnapshot.docs[0].data(),
        } as Participant;
        queryClient.setQueryData(["activeParticipant"], activeParticipant);
      } else {
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
