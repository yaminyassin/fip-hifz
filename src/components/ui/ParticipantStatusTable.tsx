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
import { Input } from "@/components/shadcn/input";
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
  const [searchTerm, setSearchTerm] = React.useState<string>("");
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

  // Filter participants based on selected category and search term
  const filteredParticipants = React.useMemo(() => {
    let filtered = participants;

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Filter by search term (case-insensitive)
    if (searchTerm.trim()) {
      const normalizedSearchTerm = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((p) =>
        (p.name || "").toLowerCase().includes(normalizedSearchTerm)
      );
    }

    return filtered;
  }, [participants, selectedCategory, searchTerm]);

  // Group filtered participants by scheduled value
  const groupedParticipants = React.useMemo(() => {
    const groups = new Map<string, Participant[]>();

    filteredParticipants.forEach((participant) => {
      const scheduledValue = participant.scheduled || "Unscheduled";
      if (!groups.has(scheduledValue)) {
        groups.set(scheduledValue, []);
      }
      groups.get(scheduledValue)!.push(participant);
    });

    // Sort groups by scheduled value (treat as numbers if possible, otherwise alphabetically)
    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      // Try to parse as numbers first
      const numA = parseInt(a);
      const numB = parseInt(b);

      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }

      // If not numbers, sort alphabetically, but put "Unscheduled" last
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      return a.localeCompare(b);
    });

    return sortedGroups;
  }, [filteredParticipants]);

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

  // Render participant row
  const renderParticipantRow = (participant: Participant) => {
    const displayStatus = getParticipantDisplayStatus(participant);
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
        <TableCell>{participant.scheduled || "-"}</TableCell>
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
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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

        {/* Search Input */}
        <div className="flex items-center space-x-2">
          <label htmlFor="search-input" className="text-sm font-medium">
            {t("admin.filter.search")}:
          </label>
          <Input
            id="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("admin.filter.searchPlaceholder")}
            className="w-[200px]"
          />
        </div>
      </div>

      {/* Loading indicator for refetches */}
      {isFetchingParticipants && !isLoadingParticipants && (
        <div className="absolute top-0 left-0 right-0 flex justify-center p-2 opacity-75">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Grouped Participants Tables */}
      <div className="space-y-6 relative">
        {groupedParticipants.length === 0 ? (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.participants.name")}</TableHead>
                  <TableHead>{t("admin.participants.category")}</TableHead>
                  <TableHead>{t("admin.participants.scheduled")}</TableHead>
                  <TableHead>{t("admin.participants.status")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.participants.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t("admin.participants.noParticipants")}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          groupedParticipants.map(([scheduledValue, groupParticipants]) => (
            <div key={scheduledValue} className="space-y-2">
              {/* Group Header */}
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("admin.participants.scheduledGroup", {
                    scheduled: scheduledValue,
                  })}
                </h3>
                <span className="text-xs text-muted-foreground">
                  ({groupParticipants.length}{" "}
                  {groupParticipants.length === 1
                    ? t("admin.participants.participant")
                    : t("admin.participants.participants")}
                  )
                </span>
              </div>

              {/* Group Table */}
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.participants.name")}</TableHead>
                      <TableHead>{t("admin.participants.category")}</TableHead>
                      <TableHead>{t("admin.participants.scheduled")}</TableHead>
                      <TableHead>{t("admin.participants.status")}</TableHead>
                      <TableHead className="text-right">
                        {t("admin.participants.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupParticipants.map(renderParticipantRow)}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
