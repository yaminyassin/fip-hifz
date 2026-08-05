import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { Button } from "@/components/shadcn/button";
import { useTranslation } from "react-i18next";
import { useJuryMembers } from "@/hooks/useJuryMembers";
import {
  updateJuryActiveStatus,
  setAllJuryActive,
  updateJuryEvaluationStatus,
} from "@/services/jury";
import { useEvent } from "@/contexts/EventContext";
import { notifyError, notifySuccess, NOTIFY_KEYS } from "@/lib/notify";
import { useState } from "react";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const JuryTable = () => {
  const { t } = useTranslation();
  const { currentEvent } = useEvent();
  const { data: juryMembers, isLoading } = useJuryMembers();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isUpdatingEvaluation, setIsUpdatingEvaluation] = useState<
    string | null
  >(null);

  const handleToggleActive = async (
    juryId: string,
    currentStatus: boolean,
    juryName: string
  ) => {
    if (!currentEvent) return;
    setIsUpdating(juryId);
    try {
      await updateJuryActiveStatus(currentEvent, juryId, !currentStatus);
      notifySuccess({
        key: NOTIFY_KEYS.juryManage,
        title: t("admin.jury.activeStatusUpdatedTitle"),
        description: currentStatus
          ? t("admin.jury.deactivatedDesc", { name: juryName })
          : t("admin.jury.activatedDesc", { name: juryName }),
      });
    } catch (error) {
      console.error("Error updating jury active status:", error);
      notifyError({
        key: NOTIFY_KEYS.juryManage,
        title: t("admin.jury.activeStatusFailedTitle"),
        description: t("admin.jury.actionFailedDesc", {
          name: juryName,
          reason: errorMessage(error),
        }),
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleToggleEvaluationStatus = async (
    juryId: string,
    currentStatus: boolean,
    juryName: string
  ) => {
    if (!currentEvent) return;
    setIsUpdatingEvaluation(juryId);
    try {
      await updateJuryEvaluationStatus(currentEvent, juryId, !currentStatus);
      notifySuccess({
        key: NOTIFY_KEYS.juryManage,
        title: t("admin.jury.evaluationStatusUpdatedTitle"),
        description: t("admin.jury.evaluationStatusUpdatedDesc", { name: juryName }),
      });
    } catch (error) {
      console.error("Error updating jury evaluation status:", error);
      notifyError({
        key: NOTIFY_KEYS.juryManage,
        title: t("admin.jury.evaluationStatusFailedTitle"),
        description: t("admin.jury.actionFailedDesc", {
          name: juryName,
          reason: errorMessage(error),
        }),
      });
    } finally {
      setIsUpdatingEvaluation(null);
    }
  };

  const handleSetAllActive = async () => {
    if (!currentEvent) return;
    setIsBulkUpdating(true);
    try {
      await setAllJuryActive(currentEvent, true);
      notifySuccess({
        key: NOTIFY_KEYS.juryManage,
        title: t("admin.jury.allActivatedTitle"),
        description: t("admin.jury.allActivatedDesc"),
      });
    } catch (error) {
      console.error("Error setting all jury active:", error);
      notifyError({
        key: NOTIFY_KEYS.juryManage,
        title: t("admin.jury.allActivatedFailedTitle"),
        description: t("admin.jury.bulkFailedDesc", { reason: errorMessage(error) }),
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    juryId: string,
    currentStatus: boolean,
    juryName: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleToggleEvaluationStatus(juryId, currentStatus, juryName);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {t("admin.table.juryMembers")}
        </h3>
        <Button
          onClick={handleSetAllActive}
          disabled={isBulkUpdating}
          className="bg-green-600 hover:bg-green-700"
        >
          {isBulkUpdating
            ? t("common.loading")
            : t("admin.actions.setAllActive")}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.table.juryName")}</TableHead>
              <TableHead>{t("admin.table.currentQuestion")}</TableHead>
              <TableHead>{t("admin.table.evaluationStatus")}</TableHead>
              <TableHead>{t("admin.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {juryMembers?.map((jury) => (
              <TableRow key={jury.id}>
                <TableCell className="font-medium">{jury.name}</TableCell>
                <TableCell>
                  {t("jury.question")} {jury.currentQuestion}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      jury.hasFinishedEvaluating
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                    } ${isUpdatingEvaluation === jury.id ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() =>
                      handleToggleEvaluationStatus(
                        jury.id,
                        jury.hasFinishedEvaluating,
                        jury.name
                      )
                    }
                    onKeyDown={(event) =>
                      handleKeyDown(
                        event,
                        jury.id,
                        jury.hasFinishedEvaluating,
                        jury.name
                      )
                    }
                    tabIndex={0}
                    role="button"
                    aria-label={`Toggle evaluation status for ${jury.name}. Current status: ${
                      jury.hasFinishedEvaluating ? "completed" : "in progress"
                    }`}
                  >
                    {isUpdatingEvaluation === jury.id
                      ? t("common.updating")
                      : jury.hasFinishedEvaluating
                        ? t("jury.actions.completed")
                        : t("jury.messages.inProgress")}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() =>
                      handleToggleActive(jury.id, jury.isActive, jury.name)
                    }
                    disabled={isUpdating === jury.id}
                    variant={jury.isActive ? "destructive" : "default"}
                    size="sm"
                    className={
                      jury.isActive
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-green-500 hover:bg-green-600"
                    }
                  >
                    {isUpdating === jury.id
                      ? t("common.updating")
                      : jury.isActive
                        ? t("admin.actions.deactivate")
                        : t("admin.actions.activate")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
