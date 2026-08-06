import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParticipants } from "@/hooks/useParticipants";
import { Participant } from "@/models/models";
import { Button } from "@/components/shadcn/button";
import { ParticipantForm } from "./ParticipantForm";
import {
  deleteParticipant,
  resetAllParticipantStatuses,
} from "@/services/participants";
import { useEvent } from "@/contexts/EventContext";
import { notifyError, notifySuccess, NOTIFY_KEYS } from "@/lib/notify";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Upload, Edit, Trash, X, RefreshCcw } from "lucide-react";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { getFlagForCountry } from "@/lib/countryUtils";

export const ParticipantManagement = () => {
  const { t } = useTranslation();
  const { currentEvent } = useEvent();
  const queryClient = useQueryClient();
  const {
    data: participants = [],
    isLoading,
    error: participantsError,
  } = useParticipants();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingParticipant, setEditingParticipant] =
    useState<Participant | null>(null);
  const [showExcelImportPlaceholder, setShowExcelImportPlaceholder] =
    useState(false);

  const resetStatusesMutation = useMutation({
    mutationFn: () => {
      if (!currentEvent) throw new Error('No event selected');
      return resetAllParticipantStatuses(currentEvent);
    },
    onSuccess: () => {
      notifySuccess({
        key: NOTIFY_KEYS.participantSave,
        title: t("admin.participants.resetStatusesDoneTitle"),
        description: t("admin.participants.resetStatusesDoneDesc"),
      });
    },
    onError: (error) => {
      console.error("Failed to reset participant statuses:", error);
      notifyError({
        key: NOTIFY_KEYS.participantSave,
        title: t("admin.participants.resetStatusesFailedTitle"),
        description: t("admin.participants.resetStatusesFailedDesc", {
          reason: error instanceof Error ? error.message : String(error),
        }),
      });
    },
  });

  const filteredParticipants = participants.filter(
    (participant) =>
      (participant.name?.toLowerCase() || "").includes(
        searchQuery.toLowerCase()
      ) ||
      (participant.country?.toLowerCase() || "").includes(
        searchQuery.toLowerCase()
      ) ||
      (participant.category?.toLowerCase() || "").includes(
        searchQuery.toLowerCase()
      ) ||
      (participant.school?.toLowerCase() || "").includes(
        searchQuery.toLowerCase()
      )
  );

  const handleAddNewClick = () => {
    setShowAddForm(true);
    setEditingParticipant(null);
  };

  const handleEditClick = (participant: Participant) => {
    setEditingParticipant(participant);
    setShowAddForm(true);
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (!currentEvent) return;
    if (window.confirm(t("admin.participants.confirmDelete"))) {
      try {
        await deleteParticipant(currentEvent, id);
        queryClient.invalidateQueries({ queryKey: ["participants"] });
        notifySuccess({
          key: NOTIFY_KEYS.participantDelete,
          title: t("admin.participants.deletedTitle"),
          description: t("admin.participants.deletedDesc", { name }),
        });
      } catch (error) {
        console.error("Error deleting participant:", error);
        notifyError({
          key: NOTIFY_KEYS.participantDelete,
          title: t("admin.participants.deleteFailedTitle"),
          description: t("admin.participants.deleteFailedDesc", {
            name,
            reason: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    }
  };

  const handleFormClose = () => {
    setShowAddForm(false);
    setEditingParticipant(null);
  };

  const handleImportExcelClick = () => {
    setShowExcelImportPlaceholder(true);
  };

  const handleResetStatusesClick = () => {
    if (window.confirm(t("admin.participants.confirmReset"))) {
      resetStatusesMutation.mutate();
    }
  };

  const renderTableContent = () => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, index) => (
        <tr key={`loading-${index}`}>
          <td colSpan={6} className="px-4 py-4">
            <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          </td>
        </tr>
      ));
    }
    if (participantsError) {
      return (
        <tr>
          <td colSpan={6} className="px-4 py-6 text-center text-red-600">
            {t("error.general", "Error loading participants: ")}
            {participantsError instanceof Error
              ? participantsError.message
              : String(participantsError)}
          </td>
        </tr>
      );
    }
    if (filteredParticipants.length === 0 && !isLoading) {
      return (
        <tr>
          <td
            colSpan={6}
            className="px-4 py-4 text-center text-sm text-muted-foreground"
          >
            {searchQuery
              ? t("admin.participants.noSearchResults")
              : t("admin.participants.noParticipants")}
          </td>
        </tr>
      );
    }

    return filteredParticipants.map((participant) => (
      <tr key={participant.id} className="hover:bg-muted/50">
        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
          {participant.name || "N/A"}
        </td>
        <td className="px-4 py-4 whitespace-nowrap text-sm">
          {participant.age || "N/A"}
        </td>
        <td className="px-4 py-4 whitespace-nowrap text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="text-lg">{getFlagForCountry(participant.country) || "🌍"}</span>
            <span>{participant.country || "N/A"}</span>
          </span>
        </td>
        <td className="px-4 py-4 whitespace-nowrap text-sm">
          <span className="inline-flex rounded-full px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {participant.category || "N/A"}
          </span>
        </td>
        <td className="px-4 py-4 whitespace-nowrap text-sm">
          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${participant.isActive
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : participant.isDone
                  ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                }`}
            >
              {participant.isActive
                ? t("common.active")
                : participant.isDone
                  ? t("common.completed")
                  : t("common.inactive")}
            </span>
          </div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditClick(participant)}
              className="h-8 w-8 p-0 border-2"
              aria-label={t("common.edit")}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                handleDeleteClick(participant.id, participant.name)
              }
              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 border-2 border-red-200 hover:border-red-500 dark:hover:bg-red-900/50"
              aria-label={t("common.delete")}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>
    ));
  };

  return (
    <div className="space-y-4">
      {/* Header with buttons */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">
          {t("admin.participants.title")}
        </h2>
        <div className="flex space-x-4">
          <Button
            onClick={handleAddNewClick}
            className="flex items-center gap-2 border-2 border-primary shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            {t("admin.participants.addNew")}
          </Button>
          <Button
            variant="outline"
            onClick={handleImportExcelClick}
            className="flex items-center gap-2 border-2 shadow-sm"
          >
            <Upload className="w-4 h-4" />
            {t("admin.participants.importExcel")}
          </Button>
          <Button
            variant="outline"
            onClick={handleResetStatusesClick}
            disabled={resetStatusesMutation.isPending}
            className="flex items-center gap-2 border-2 shadow-sm text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-900/50 dark:hover:text-amber-300"
            aria-label={t(
              "admin.participants.resetStatusesAria",
              "Reset all participant completion statuses"
            )}
          >
            <RefreshCcw className="w-4 h-4" />
            {resetStatusesMutation.isPending
              ? t("admin.participants.resettingStatuses", "Resetting...")
              : t("admin.participants.resetStatuses", "Reset Statuses")}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full md:w-72">
        <Input
          placeholder={t("admin.participants.search")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Participants Table - Only showing essential, non-sensitive columns */}
      <div className="border-2 rounded-md overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.age")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.country")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.category")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.status")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-gray-200 dark:divide-gray-700">
              {renderTableContent()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Form Modal - Photo and other details only visible here */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 relative border-2 shadow-lg">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFormClose}
              className="absolute top-2 right-2 h-8 w-8 p-0 border-2"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </Button>
            <ParticipantForm
              participant={editingParticipant || undefined}
              onSuccess={handleFormClose}
              onCancel={handleFormClose}
            />
          </Card>
        </div>
      )}

      {/* Excel Import Placeholder */}
      {showExcelImportPlaceholder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-lg w-full p-6 relative border-2 shadow-lg">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExcelImportPlaceholder(false)}
              className="absolute top-2 right-2 h-8 w-8 p-0 border-2"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="text-center space-y-4">
              <h3 className="text-lg font-semibold">
                {t("admin.participants.importExcel")}
              </h3>
              <p className="text-muted-foreground">
                {t("admin.participants.importExcelPlaceholder")}
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mt-4">
                <input
                  type="file"
                  className="hidden"
                  id="excel-file-input"
                  accept=".xlsx,.xls,.csv"
                />
                <label
                  htmlFor="excel-file-input"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  <Upload className="h-10 w-10 text-gray-400 mb-2" />
                  <span className="text-sm text-muted-foreground">
                    {t("admin.participants.dropExcelFile")}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    (.xlsx, .xls, .csv)
                  </span>
                </label>
              </div>

              <div className="flex justify-end space-x-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowExcelImportPlaceholder(false)}
                  className="border-2"
                >
                  {t("common.cancel")}
                </Button>
                <Button type="button" disabled className="border-2">
                  {t("common.import")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
