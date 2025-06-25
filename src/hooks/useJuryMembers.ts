import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, QuerySnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Jury } from "@/models/models";
import { useFirestoreListener } from "./useFirestoreListener";
import { useEvent } from "@/contexts/EventContext";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import { useMemo } from "react";

export const useJuryMembers = () => {
    const queryClient = useQueryClient();
    const { currentEvent } = useEvent();

    const juryQuery = useMemo(() => {
        if (!currentEvent) return null;
        return collection(firestore, getEventCollectionPath(currentEvent, "jury"));
    }, [currentEvent]);

    // Initialize the query cache with an empty array if it doesn't exist yet
    if (!queryClient.getQueryData(["juryMembers", currentEvent])) {
        queryClient.setQueryData(["juryMembers", currentEvent], []);
    }

    // Use centralized listener management
    useFirestoreListener<QuerySnapshot>({
        query: juryQuery,
        key: `jury-members-collection-${currentEvent}`,
        onData: (snapshot) => {
            const juryMembers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Jury));

            // Update the query cache with the fresh jury members
            queryClient.setQueryData(["juryMembers", currentEvent], juryMembers);
        },
        onError: (error) => {
            console.error("Error fetching jury members:", error);
        },
        enabled: !!juryQuery,
    });

    return useQuery<Jury[]>({
        queryKey: ["juryMembers", currentEvent],
        queryFn: () => {
            // Get current jury members from cache or return empty array
            return queryClient.getQueryData<Jury[]>(["juryMembers", currentEvent]) || [];
        },
        staleTime: Infinity, // Never mark as stale since we're using real-time updates
        enabled: !!currentEvent,
    });
}; 