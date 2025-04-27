import React from "react";
import { Button } from "@/components/shadcn/button";
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
import { useParticipants } from "@/hooks/useParticipants"; // Import the hook
import { Participant } from "@/models/models"; // Import the Participant type
import { useActiveParticipant } from "@/hooks/useActiveParticipant"; // Import hook for getting active participant
import { useMutation } from "@tanstack/react-query"; // Import mutation tools
import {
  collection,
  doc,
  writeBatch,
  getDocs,
  updateDoc,
} from "firebase/firestore"; // Import firestore functions
import { firestore } from "@/main"; // Import firestore instance
import { CheckCircle2 } from "lucide-react"; // Import icon

// Define status types explicitly based on derived logic
type DisplayStatus = "Active" | "Inactive" | "Completed";

export function ActiveParticipantSetter() {
  const { t } = useTranslation();

  // Fetch all participants for the table
  const {
    data: participants = [],
    isLoading: isLoadingParticipants,
    error: participantsError,
  } = useParticipants();

  // Fetch the currently active participant (real-time)
  const {
    data: activeParticipant,
    isLoading: isLoadingActive,
    error: activeError,
  } = useActiveParticipant();

  // Mutation to set the active participant in Firestore
  const setActiveParticipantMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const batch = writeBatch(firestore);

      // First, set all participants as inactive
      const participantsRef = collection(firestore, "participants");
      const snapshot = await getDocs(participantsRef);
      snapshot.docs.forEach((docRef) => {
        // Only set inactive if it's not the one we are activating
        if (docRef.id !== participantId) {
          batch.update(docRef.ref, { isActive: false });
        }
      });

      // Then set the selected participant as active and not done
      const selectedParticipantRef = doc(
        firestore,
        "participants",
        participantId
      );
      batch.update(selectedParticipantRef, { isActive: true, isDone: false }); // Ensure isDone is false when activating

      await batch.commit();
    },
    onSuccess: () => {
      // NOTE: Removed invalidateQueries calls.
      // The onSnapshot listeners in useParticipants and useActiveParticipant
      // should automatically update the cache when Firestore data changes.
      // queryClient.invalidateQueries({ queryKey: ["participants"] });
      // queryClient.invalidateQueries({ queryKey: ["activeParticipant"] });
      console.log(
        "Successfully set active participant. Cache update handled by listeners."
      );
    },
    onError: (error) => {
      console.error("Error setting active participant:", error);
      // TODO: Add error toast message
    },
  });

  // Mutation to mark a participant as done
  const markParticipantDoneMutation = useMutation({
    mutationFn: async (participantId: string) => {
      if (!participantId) return; // Guard clause
      const participantRef = doc(firestore, "participants", participantId);
      await updateDoc(participantRef, {
        isActive: false,
        isDone: true,
      });
    },
    onSuccess: (data, variables) => {
      console.log(
        `Successfully marked participant ${variables} as done. Cache update handled by listeners.`
      );
    },
    onError: (error, variables) => {
      console.error(`Error marking participant ${variables} as done:`, error);
      // TODO: Add error toast message
    },
  });

  const handleSetActive = (participantId: string): void => {
    setActiveParticipantMutation.mutate(participantId);
  };

  const handleMarkDone = (participantId: string): void => {
    markParticipantDoneMutation.mutate(participantId);
  };

  // Helper function for status styling
  const getStatusClasses = (status: DisplayStatus): string => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Inactive":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
      case "Completed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: // Should not happen with defined types, but good practice
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  // Helper to derive display status and text
  const getParticipantDisplayStatus = (
    participant: Participant | null | undefined
  ): { status: DisplayStatus; text: string } => {
    if (!participant) return { status: "Inactive", text: "" }; // Handle null case
    if (participant.isDone) {
      return { status: "Completed", text: t("common.completed", "Completed") };
    }
    if (participant.isActive) {
      return { status: "Active", text: t("common.active", "Active") };
    }
    return { status: "Inactive", text: t("common.inactive", "Inactive") };
  };

  // Render Active Participant Header section with its own loading/error handling
  const renderActiveParticipantHeader = () => {
    if (isLoadingActive) {
      return (
        <div className="p-4 text-center text-muted-foreground">
          {t("loading", "Loading active participant...")}
        </div>
      );
    }
    if (activeError) {
      return (
        <div className="p-4 text-center text-red-600">
          {t("error.general", "Error loading active participant: ")}
          {activeError instanceof Error
            ? activeError.message
            : String(activeError)}
        </div>
      );
    }

    const activeParticipantDisplayStatus =
      getParticipantDisplayStatus(activeParticipant);
    return (
      <div className="flex items-center justify-between">
        {activeParticipant ? (
          <div className="flex items-center space-x-4">
            <span className="font-medium text-xl">
              {activeParticipant.name || t("common.unnamed", "Unnamed")}
            </span>
            <span
              className={cn(
                "inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold",
                getStatusClasses(activeParticipantDisplayStatus.status)
              )}
            >
              {activeParticipantDisplayStatus.text}
            </span>
            {activeParticipant.assignedQuestions &&
              activeParticipant.assignedQuestions.length > 0 && (
                <span className="text-sm text-muted-foreground font-mono ml-4 border-l-2 pl-4">
                  {t("admin.activeQuestion.label", "Q:")}
                  {activeParticipant.assignedQuestions.indexOf(
                    activeParticipant.activeQuestion
                  ) !== -1
                    ? ` ${activeParticipant.assignedQuestions.indexOf(activeParticipant.activeQuestion) + 1}/${activeParticipant.assignedQuestions.length}`
                    : " -/- "}
                  ({t("admin.activeQuestion.page", "Pg:")}{" "}
                  {activeParticipant.activeQuestion || "-"})
                </span>
              )}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {t(
              "admin.activeParticipant.noneSet",
              "No participant is currently active."
            )}
          </p>
        )}

        {activeParticipant && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/50 dark:hover:text-red-300"
            onClick={() => handleMarkDone(activeParticipant.id)}
            disabled={markParticipantDoneMutation.isPending}
            aria-label={t("admin.participants.markDoneAria", {
              name: activeParticipant.name || "participant",
            })}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {markParticipantDoneMutation.isPending
              ? t("common.markingDone", "Marking Done...")
              : t("common.markDone", "Mark as Done")}
          </Button>
        )}
      </div>
    );
  };

  // Render Participants Table section with its own loading/error handling
  const renderParticipantsTable = () => {
    if (isLoadingParticipants) {
      return (
        <div className="p-4 text-center text-muted-foreground">
          {t("loading", "Loading participants list...")}
        </div>
      );
    }
    if (participantsError) {
      return (
        <div className="p-4 text-center text-red-600">
          {t("error.general", "Error loading participants list: ")}
          {participantsError instanceof Error
            ? participantsError.message
            : String(participantsError)}
        </div>
      );
    }
    if (participants.length === 0) {
      return (
        <div className="p-4 text-center border-2 rounded-md shadow-sm bg-card">
          {t("admin.participants.none", "No participants found.")}
        </div>
      );
    }

    return (
      <div className="border-2 rounded-md overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.participants.name", "Name")}</TableHead>
              <TableHead>{t("admin.participants.status", "Status")}</TableHead>
              <TableHead className="text-right">
                {t("admin.participants.action", "Action")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((participant) => {
              const displayStatus = getParticipantDisplayStatus(participant);
              const isActive = participant.id === activeParticipant?.id;
              return (
                <TableRow
                  key={participant.id}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "hover:bg-muted/50",
                    isActive ? "bg-muted/50" : ""
                  )}
                >
                  <TableCell className="font-medium">
                    {participant.name ||
                      t("common.unnamed", "Unnamed Participant")}
                  </TableCell>
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
                      onClick={() => handleSetActive(participant.id)}
                      disabled={
                        isActive ||
                        participant.isDone ||
                        setActiveParticipantMutation.isPending
                      }
                      size="sm"
                      variant={isActive ? "outline" : "default"}
                      aria-label={t("admin.participants.setActiveAria", {
                        name: participant.name || "participant",
                      })}
                      aria-disabled={
                        isActive ||
                        participant.isDone ||
                        setActiveParticipantMutation.isPending
                      }
                    >
                      {setActiveParticipantMutation.isPending &&
                      setActiveParticipantMutation.variables === participant.id
                        ? t("common.settingActive", "Setting...")
                        : isActive
                          ? t("admin.participants.currentlyActive", "Active")
                          : t("admin.participants.setActive", "Set Active")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Active Participant Display Section */}
      <div className="mb-6 p-4 border-b-2">
        <h3 className="text-lg font-semibold mb-2">
          {t("admin.activeParticipant.current", "Currently Active Participant")}
        </h3>
        {renderActiveParticipantHeader()}
      </div>

      {/* Participants Table Section */}
      <div>
        <h3 className="text-xl font-semibold mb-4">
          {t(
            "admin.activeParticipant.setInstruction",
            "Select Participant to Set Active"
          )}
        </h3>
        {renderParticipantsTable()}
      </div>
    </div>
  );
}
