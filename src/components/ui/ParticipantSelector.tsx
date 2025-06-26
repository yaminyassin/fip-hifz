import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
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
import { useTranslation } from "react-i18next";
import { useEvent } from "@/contexts/EventContext";
import { getEventCollectionPath } from "@/utils/firebaseUtils";

export const ParticipantSelector = () => {
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const { currentEvent } = useEvent();

    const { data: participants, isLoading } = useQuery({
        queryKey: ["participants", currentEvent],
        queryFn: async () => {
            if (!currentEvent) {
                throw new Error("No event selected");
            }
            const participantsRef = collection(firestore, getEventCollectionPath(currentEvent, "participants"));
            const snapshot = await getDocs(participantsRef);
            return snapshot.docs.map(
                (doc) => ({ id: doc.id, ...doc.data() } as Participant)
            );
        },
        enabled: !!currentEvent,
    });

    const setActiveParticipant = useMutation({
        mutationFn: async (participantId: string) => {
            if (!currentEvent) {
                throw new Error("No event selected");
            }
            const batch = writeBatch(firestore);

            // First, set all participants as inactive
            const participantsRef = collection(firestore, getEventCollectionPath(currentEvent, "participants"));
            const snapshot = await getDocs(participantsRef);
            snapshot.docs.forEach((doc) => {
                batch.update(doc.ref, { isActive: false });
            });

            // Then set the selected participant as active
            const participantsCollection = collection(firestore, getEventCollectionPath(currentEvent, "participants"));
            const selectedParticipantRef = doc(participantsCollection, participantId);
            batch.update(selectedParticipantRef, { isActive: true });

            await batch.commit();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["participants", currentEvent] });
            queryClient.invalidateQueries({ queryKey: ["activeParticipant", currentEvent] });
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

    if (!currentEvent) {
        return (
            <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">{t("error.noEventSelected")}</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">{t("common.loading")}</p>
            </div>
        );
    }

    const activeParticipant = participants?.find((p) => p.isActive);

    return (
        <div className="space-y-6">
            <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">{t("participants.currentActive")}</label>
                <p className="text-lg font-semibold">
                    {activeParticipant?.name || t("participants.noActive")}
                </p>
            </div>

            <div className="flex flex-col space-y-4">
                <label className="text-sm font-medium">{t("participants.selectNew")}</label>
                <div className="flex gap-4">
                    <Select
                        value={selectedParticipantId}
                        onValueChange={handleParticipantChange}
                    >
                        <SelectTrigger className="w-[300px]">
                            <SelectValue placeholder={t("participants.selectPlaceholder")} />
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
                        {setActiveParticipant.isPending 
                            ? t("participants.actions.activating")
                            : t("participants.actions.setActive")}
                    </Button>
                </div>
            </div>
        </div>
    );
}; 