import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useParticipants } from "@/hooks/useParticipants";
import { Participant } from "@/models/models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Button } from "@/components/shadcn/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { doc, writeBatch } from "firebase/firestore";
import { firestore } from "@/main";
import { Loader2 } from "lucide-react";

type DisplayStatus = "Active" | "Inactive" | "Completed";

export function ParticipantStatusTable() {
  const { t } = useTranslation();
  const {
    data: participants = [],
    isLoading: isLoadingParticipants,
    isFetching: isFetchingParticipants,
  } = useParticipants();
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const queryClient = useQueryClient();

  // Set Active Participant Mutation
  const setActiveMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const batch = writeBatch(firestore);

      // Get current participants directly for the batch operation
      const currentParticipants =
        queryClient.getQueryData<Participant[]>(["participants"]) || [];

      // First, set all participants as inactive
      currentParticipants.forEach((p) => {
        if (p.id !== participantId) {
          // Ensure we don't mark the target as inactive
          const participantRef = doc(firestore, "participants", p.id);
          batch.update(participantRef, { isActive: false });
        }
      });

      // Then set the selected participant as active and ensure isDone is false
      const selectedParticipantRef = doc(
        firestore,
        "participants",
        participantId
      );
      batch.update(selectedParticipantRef, { isActive: true, isDone: false }); // Explicitly set isActive: true

      await batch.commit();
      return participantId; // Return the ID for potential use in callbacks
    },
    onMutate: async (participantId) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["participants"] });

      // Snapshot the previous value
      const previousParticipants = queryClient.getQueryData<Participant[]>([
        "participants",
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<Participant[]>(
        ["participants"],
        (oldData = []) =>
          oldData.map((p) => ({
            ...p,
            // Set the target participant active, others inactive
            isActive: p.id === participantId,
            // If we're activating a participant, ensure they are not marked done
            isDone: p.id === participantId ? false : p.isDone,
          }))
      );

      // Return a context object with the snapshotted value
      return { previousParticipants };
    },
    onError: (err, _participantId, context) => {
      console.error("Error setting participant active:", err);
      // Rollback to the previous state on error
      if (context?.previousParticipants) {
        queryClient.setQueryData(
          ["participants"],
          context.previousParticipants
        );
      }
    },
  });

  // Get unique categories from participants
  const categories = React.useMemo(() => {
    const uniqueCategories = new Set(
      participants.map((p) => p.category).filter(Boolean)
    );
    // Ensure 'all' is always an option
    return ["all", ...Array.from(uniqueCategories).sort()];
  }, [participants]);

  // Filter participants based on selected category
  const filteredParticipants = React.useMemo(() => {
    // Use the participants data directly from the hook
    if (selectedCategory === "all") return participants;
    return participants.filter((p) => p.category === selectedCategory);
  }, [participants, selectedCategory]);

  // Helper function for status styling
  const getStatusClasses = (status: DisplayStatus): string => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Completed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: // Inactive
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  // Helper to derive display status
  const getParticipantDisplayStatus = (
    participant: Participant
  ): { status: DisplayStatus; text: string } => {
    // Check isDone first as it takes precedence
    if (participant.isDone)
      return { status: "Completed", text: t("common.completed") };
    if (participant.isActive)
      return { status: "Active", text: t("common.active") };
    return { status: "Inactive", text: t("common.inactive") };
  };

  // Handle Set Active Click
  const handleSetActive = (participantId: string) => {
    // Prevent mutation if already processing
    if (setActiveMutation.isPending) return;
    setActiveMutation.mutate(participantId);
  };

  // Use isLoading for initial load, isFetching for subsequent loads
  if (isLoadingParticipants) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-label={t("common.loading")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex items-center space-x-2">
        <label htmlFor="category-filter" className="text-sm font-medium">
          {t("admin.filter.category")}:
        </label>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger id="category-filter" className="w-[180px]">
            <SelectValue placeholder={t("admin.filter.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category === "all"
                  ? t("admin.filter.allCategories")
                  : category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Participants Table */}
      {/* Add a loading indicator for refetches as well */}
      {isFetchingParticipants && !isLoadingParticipants && (
        <div className="absolute top-0 left-0 right-0 flex justify-center p-2 opacity-75">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="border rounded-md overflow-x-auto relative">
        {" "}
        {/* Added relative positioning for potential loading overlay */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.participants.name")}</TableHead>
              <TableHead>{t("admin.participants.category")}</TableHead>
              <TableHead>{t("admin.participants.status")}</TableHead>
              <TableHead className="text-right">
                {t("admin.participants.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Handle case where there are no participants */}
            {filteredParticipants.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("admin.participants.noParticipants")}
                </TableCell>
              </TableRow>
            ) : (
              filteredParticipants.map((participant) => {
                const displayStatus = getParticipantDisplayStatus(participant);
                // Check if the mutation is pending for this specific participant
                const isMutatingThisParticipant =
                  setActiveMutation.isPending &&
                  setActiveMutation.variables === participant.id;

                return (
                  <TableRow
                    key={participant.id}
                    aria-current={participant.isActive ? "page" : undefined}
                  >
                    <TableCell className="font-medium">
                      {participant.name || t("common.unnamed")}
                    </TableCell>
                    <TableCell>{participant.category || "-"}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                          getStatusClasses(displayStatus.status)
                        )}
                      >
                        {displayStatus.text}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={participant.isActive ? "outline" : "default"}
                        size="sm"
                        // Disable if:
                        // 1. Participant is already done.
                        // 2. Participant is already active.
                        // 3. Any 'setActive' mutation is currently pending (to prevent race conditions).
                        disabled={
                          participant.isDone ||
                          participant.isActive ||
                          setActiveMutation.isPending
                        }
                        onClick={() => handleSetActive(participant.id)}
                        aria-label={
                          participant.isActive
                            ? t("admin.participants.currentlyActive")
                            : t("admin.participants.setActiveAria")
                        }
                        aria-disabled={
                          participant.isDone ||
                          participant.isActive ||
                          setActiveMutation.isPending
                        }
                      >
                        {/* Show loader only if this specific participant is being mutated */}
                        {isMutatingThisParticipant ? (
                          <Loader2
                            className="h-4 w-4 animate-spin mr-2"
                            aria-hidden="true"
                          />
                        ) : null}
                        {participant.isActive
                          ? t("admin.participants.currentlyActive")
                          : t("admin.participants.setActive")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
