import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, QuerySnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Jury } from "@/models/models";
import { useFirestoreListener } from "./useFirestoreListener";

export const useJuryMembers = () => {
    const queryClient = useQueryClient();

    // Initialize the query cache with an empty array if it doesn't exist yet
    if (!queryClient.getQueryData(["juryMembers"])) {
        queryClient.setQueryData(["juryMembers"], []);
    }

    // Use centralized listener management
    useFirestoreListener<QuerySnapshot>({
        query: collection(firestore, "jury"),
        key: "jury-members-collection",
        onData: (snapshot) => {
            const juryMembers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Jury));

            // Update the query cache with the fresh jury members
            queryClient.setQueryData(["juryMembers"], juryMembers);
        },
        onError: (error) => {
            console.error("Error fetching jury members:", error);
        }
    });

    return useQuery<Jury[]>({
        queryKey: ["juryMembers"],
        queryFn: () => {
            // Get current jury members from cache or return empty array
            return queryClient.getQueryData<Jury[]>(["juryMembers"]) || [];
        },
        staleTime: Infinity, // Never mark as stale since we're using real-time updates
    });
}; 