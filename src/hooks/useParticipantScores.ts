import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import { Scores } from "@/models/models";
import { useEffect } from "react";

export const useParticipantScores = (participantId: string, questionNumber?: number) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!participantId) return;

        const scoresRef = collection(firestore, "scores");
        const constraints = [where("participantId", "==", participantId)];

        if (questionNumber) {
            constraints.push(where("questionNumber", "==", questionNumber));
        }

        const q = query(scoresRef, ...constraints);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const scores: Scores[] = [];
            querySnapshot.forEach((doc) => {
                scores.push({ id: doc.id, ...doc.data() } as Scores);
            });

            const queryKey = questionNumber
                ? ["scores", participantId, questionNumber]
                : ["scores", participantId];

            queryClient.setQueryData(queryKey, scores);
        }, (error) => {
            console.error("Error fetching scores:", error);
        });

        return () => unsubscribe();
    }, [participantId, questionNumber, queryClient]);

    return useQuery({
        queryKey: questionNumber
            ? ["scores", participantId, questionNumber]
            : ["scores", participantId],
        queryFn: () => [], // Initial value, will be updated by the listener
        staleTime: Infinity, // Never mark as stale since we're using real-time updates
        enabled: !!participantId,
    });
}; 