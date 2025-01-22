import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Jury } from "@/models/models";
import { useEffect } from "react";

export const useJuryMembers = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        const juryRef = collection(firestore, "jury");

        const unsubscribe = onSnapshot(juryRef, (snapshot) => {
            const juryMembers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Jury));
            queryClient.setQueryData(["juryMembers"], juryMembers);
        }, (error) => {
            console.error("Error fetching jury members:", error);
        });

        return () => unsubscribe();
    }, [queryClient]);

    return useQuery<Jury[]>({
        queryKey: ["juryMembers"],
        queryFn: () => [], // Initial value, will be updated by the listener
        staleTime: Infinity, // Never mark as stale since we're using real-time updates
    });
}; 