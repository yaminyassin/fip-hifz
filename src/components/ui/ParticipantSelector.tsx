import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, doc, updateDoc, writeBatch } from "firebase/firestore";
import { firestore } from "@/main";
import { Participant } from "@/models/models";
import { Button } from "@/components/shadcn/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/select";
import { useState } from "react";

export const ParticipantSelector = () => {
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
    const queryClient = useQueryClient();

    const { data: participants, isLoading } = useQuery({
        queryKey: ["participants"],
        queryFn: async () => {
            const participantsRef = collection(firestore, "participants");
            const snapshot = await getDocs(participantsRef);
            return snapshot.docs.map(
                (doc) => ({ id: doc.id, ...doc.data() } as Participant)
            );
        },
    });

    const setActiveParticipant = useMutation({
        mutationFn: async (participantId: string) => {
            const batch = writeBatch(firestore);

            // First, set all participants as inactive
            const participantsRef = collection(firestore, "participants");
            const snapshot = await getDocs(participantsRef);
            snapshot.docs.forEach((doc) => {
                batch.update(doc.ref, { isActive: false });
            });

            // Then set the selected participant as active
            const selectedParticipantRef = doc(firestore, "participants", participantId);
            batch.update(selectedParticipantRef, { isActive: true });

            await batch.commit();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["participants"] });
            queryClient.invalidateQueries({ queryKey: ["activeParticipant"] });
        },
    });

    const handleParticipantChange = (participantId: string) => {
        setSelectedParticipantId(participantId);
    };

    const handleActivateParticipant = () => {
        if (selectedParticipantId) {
            setActiveParticipant.mutate(selectedParticipantId);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">Loading participants...</p>
            </div>
        );
    }

    const activeParticipant = participants?.find((p) => p.isActive);

    return (
        <div className="space-y-6">
            <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Current Active Participant</label>
                <p className="text-lg font-semibold">
                    {activeParticipant?.name || "No active participant"}
                </p>
            </div>

            <div className="flex flex-col space-y-4">
                <label className="text-sm font-medium">Select New Participant</label>
                <div className="flex gap-4">
                    <Select
                        value={selectedParticipantId}
                        onValueChange={handleParticipantChange}
                    >
                        <SelectTrigger className="w-[300px]">
                            <SelectValue placeholder="Select a participant" />
                        </SelectTrigger>
                        <SelectContent>
                            {participants?.map((participant) => (
                                <SelectItem key={participant.id} value={participant.id}>
                                    {participant.name} - {participant.category}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        onClick={handleActivateParticipant}
                        disabled={!selectedParticipantId || setActiveParticipant.isPending}
                    >
                        {setActiveParticipant.isPending ? "Activating..." : "Set Active"}
                    </Button>
                </div>
            </div>
        </div>
    );
}; 