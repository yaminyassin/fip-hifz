import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Jury } from "@/models/models";
import { useEffect } from "react";

export const useJuryMember = (juryId: string) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!juryId) return;

        const juryRef = doc(firestore, "jury", juryId);
        const unsubscribe = onSnapshot(juryRef, (doc) => {
            if (doc.exists()) {
                const juryData = { id: doc.id, ...doc.data() } as Jury;
                queryClient.setQueryData(["jury", juryId], juryData);
            } else {
                queryClient.setQueryData(["jury", juryId], null);
            }
        }, (error) => {
            console.error("Error fetching jury member:", error);
        });

        return () => unsubscribe();
    }, [juryId, queryClient]);

    return useQuery({
        queryKey: ["jury", juryId],
        queryFn: () => null, // Initial value, will be updated by the listener
        staleTime: Infinity, // Never mark as stale since we're using real-time updates
        enabled: !!juryId,
    });
}; 