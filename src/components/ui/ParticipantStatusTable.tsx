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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { doc, writeBatch } from "firebase/firestore";
import { firestore } from "@/main";
import { Loader2, Filter, Search } from "lucide-react";
import { categoryConfigs } from "@/lib/quranUtils";

type DisplayStatus = "Active" | "Inactive" | "Completed";

export function ParticipantStatusTable() {
  const { t } = useTranslation();
  const {
    data: participants = [],
    isLoading: isLoadingParticipants,
    isFetching: isFetchingParticipants,
  } = useParticipants();

  const allSubCategories = React.useMemo(
    () =>
      Object.values(categoryConfigs)
        .flatMap((config) => config.questionRanges.map((range) => range.name))
        .sort(),
    []
  );

  const nonMCategories = React.useMemo(
    () =>
      Object.entries(categoryConfigs)
        .filter(([key]) => key !== "M")
        .flatMap(([, config]) =>
          config.questionRanges.map((range) => range.name)
        ),
    []
  );

  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([
    "all",
  ]);
  const [selectedSchedule, setSelectedSchedule] = React.useState<string>("all");
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const queryClient = useQueryClient();

  // Get unique schedules for filter dropdown
  const availableSchedules = React.useMemo(() => {
    const schedules = new Set<string>();
    participants.forEach(p => {
      const schedule = p.scheduled || "Unscheduled";
      schedules.add(schedule);
    });
    return Array.from(schedules).sort((a, b) => {
      // Put "Unscheduled" at the end
      if (a === "Unscheduled") return 1;
      if (b === "Unscheduled") return -1;
      // Try to sort numerically if possible
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }, [participants]);

  // Status options for filter
  const statusOptions = [
    { value: "all", label: t("admin.filter.all_statuses") },
    { value: "active", label: t("common.active") },
    { value: "pending", label: t("status.pending") },
    { value: "completed", label: t("common.completed") },
  ];

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

  // Filter participants based on selected categories, schedule, and search term
  const filteredParticipants = React.useMemo(() => {
    let filtered = participants;

    // Filter by search term first (case-insensitive)
    if (searchTerm.trim()) {
      const normalizedSearchTerm = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((p) =>
        (p.name || "").toLowerCase().includes(normalizedSearchTerm)
      );
    }

    // Filter by category
    const isAllSelected =
      selectedCategories.length === 1 && selectedCategories[0] === "all";
    const activeCategories = isAllSelected ? nonMCategories : selectedCategories;

    if (activeCategories.length > 0) {
      filtered = filtered.filter((participant) =>
        activeCategories.includes(participant.category)
      );
    } else {
      filtered = []; // If no categories are selected, show no participants
    }

    // Filter by schedule
    if (selectedSchedule !== "all") {
      filtered = filtered.filter((participant) => {
        const schedule = participant.scheduled || "Unscheduled";
        return schedule === selectedSchedule;
      });
    }

    // Filter by status
    if (selectedStatus !== "all") {
      filtered = filtered.filter((participant) => {
        const status = getParticipantDisplayStatus(participant);
        switch (selectedStatus) {
          case "active":
            return status.status === "Active";
          case "pending":
            return status.status === "Inactive";
          case "completed":
            return status.status === "Completed";
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [participants, selectedCategories, selectedSchedule, selectedStatus, searchTerm, nonMCategories]);

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
      {/* Enhanced Filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
        {/* Category Filter */}
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium">
            {t("admin.filter.category")}:
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>{t("participants.filter.by_category")}</span>
                {selectedCategories.length > 0 && !selectedCategories.includes('all') && (
                  <>
                    <div className="mx-2 h-4 w-px bg-muted-foreground/30" />
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {selectedCategories.length}
                    </span>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>
                {t("participants.filter.select_categories")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                key="all"
                checked={
                  selectedCategories.length === 1 &&
                  selectedCategories[0] === "all"
                }
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => {
                  setSelectedCategories(checked ? ["all"] : []);
                }}
              >
                {t("participants.filter.all_categories")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {allSubCategories.map((category) => (
                <DropdownMenuCheckboxItem
                  key={category}
                  checked={selectedCategories.includes(category)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => {
                    setSelectedCategories((prev) => {
                      // Remove 'all' if it exists, as we are selecting specifics now
                      const newSelection = prev.filter((c) => c !== "all");

                      if (checked) {
                        return [...newSelection, category];
                      } else {
                        const afterRemoval = newSelection.filter(
                          (c) => c !== category
                        );
                        // If last specific category is removed, revert to 'all'
                        return afterRemoval.length === 0
                          ? ["all"]
                          : afterRemoval;
                      }
                    });
                  }}
                >
                  {category}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Schedule Filter */}
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium">
            {t("participants.filter.by_schedule")}:
          </label>
          <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("participants.filter.all_schedules")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("participants.filter.all_schedules")}
              </SelectItem>
              {availableSchedules.map((schedule) => (
                <SelectItem key={schedule} value={schedule}>
                  {schedule}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium">
            {t("participants.filter.by_status")}:
          </label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t("participants.filter.all_statuses")} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
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
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("admin.filter.searchPlaceholder")}
              className="w-[200px] pl-8"
            />
          </div>
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
