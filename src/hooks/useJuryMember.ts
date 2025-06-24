import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, DocumentSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Jury } from "@/models/models";
import { useFirestoreListener } from "./useFirestoreListener";
import { useMemo } from "react";

export const useJuryMember = (juryId: string) => {
    const queryClient = useQueryClient();

    // Memoize the query to prevent recreation on every render
    const juryQuery = useMemo(() => {
        return juryId ? doc(firestore, "jury", juryId) : null;
    }, [juryId]);

    // Use centralized listener management
    useFirestoreListener<DocumentSnapshot>({
        query: juryQuery,
        key: `jury-member-${juryId}`,
        onData: (docSnapshot) => {
            if (docSnapshot.exists()) {
                const juryData = { id: docSnapshot.id, ...docSnapshot.data() } as Jury;
                queryClient.setQueryData(["jury", juryId], juryData);
            } else {
                queryClient.setQueryData(["jury", juryId], null);
            }
        },
        onError: (error) => {
            console.error("Error fetching jury member:", error);
        },
        enabled: !!juryId
    });

    return useQuery({
        queryKey: ["jury", juryId],
        queryFn: () => {
            // Return cached data if available, otherwise null
            const cachedData = queryClient.getQueryData<Jury | null>(["jury", juryId]);
            return cachedData || null;
        },
        staleTime: Infinity, // Never mark as stale since we're using real-time updates
        enabled: !!juryId,
    });
}; 