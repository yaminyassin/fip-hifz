import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Jury } from "@/models/models";
import { useEffect } from "react";

export const useJuryMembers = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        // Initialize the query cache with an empty array if it doesn't exist yet
        if (!queryClient.getQueryData(["juryMembers"])) {
            queryClient.setQueryData(["juryMembers"], []);
        }

        const juryRef = collection(firestore, "jury");

        const unsubscribe = onSnapshot(juryRef, (snapshot) => {
            const juryMembers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Jury));
            
            // Update the query cache with the fresh jury members
            queryClient.setQueryData(["juryMembers"], juryMembers);
        }, (error) => {
            console.error("Error fetching jury members:", error);
        });

        return () => unsubscribe();
    }, [queryClient]);

    return useQuery<Jury[]>({
        queryKey: ["juryMembers"],
        queryFn: () => {
            // Get current jury members from cache or return empty array
            return queryClient.getQueryData<Jury[]>(["juryMembers"]) || [];
        },
        staleTime: Infinity, // Never mark as stale since we're using real-time updates
    });
}; 