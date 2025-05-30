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
import { updateJuryActiveStatus, setAllJuryActive } from "@/services/jury";
import { useState } from "react";

export const JuryTable = () => {
  const { t } = useTranslation();
  const { data: juryMembers, isLoading, refetch } = useJuryMembers();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const handleToggleActive = async (juryId: string, currentStatus: boolean) => {
    setIsUpdating(juryId);
    try {
      await updateJuryActiveStatus(juryId, !currentStatus);
      await refetch(); // Refresh the data
      // TODO: Add success toast notification
    } catch (error) {
      console.error("Error updating jury active status:", error);
      // TODO: Add error toast notification
    } finally {
      setIsUpdating(null);
    }
  };

  const handleSetAllActive = async () => {
    setIsBulkUpdating(true);
    try {
      await setAllJuryActive(true);
      await refetch(); // Refresh the data
      // TODO: Add success toast notification
    } catch (error) {
      console.error("Error setting all jury active:", error);
      // TODO: Add error toast notification
    } finally {
      setIsBulkUpdating(false);
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
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      jury.hasFinishedEvaluating
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {jury.hasFinishedEvaluating
                      ? t("jury.actions.completed")
                      : t("jury.messages.inProgress")}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() => handleToggleActive(jury.id, jury.isActive)}
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
