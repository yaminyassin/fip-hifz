import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useJuryMembers } from "@/hooks/useJuryMembers";
import { Jury } from "@/models/models";
import { Button } from "@/components/shadcn/button";
import { JuryForm } from "./JuryForm";
import { deleteJury } from "@/services/jury";
import { useEvent } from "@/contexts/EventContext";
import { PlusCircle, Edit, Trash, X } from "lucide-react";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";

// Function to get fallback text when translations are missing
const getFallbackText = (key: string, defaultText: string) => {
  return key.startsWith("admin.jury") ? defaultText : key;
};

export const JuryManagement = () => {
  const { t } = useTranslation();
  const { currentEvent } = useEvent();
  const { data: juryMembers = [], isLoading } = useJuryMembers();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingJury, setEditingJury] = useState<Jury | null>(null);

  const filteredJuryMembers = juryMembers.filter((jury) =>
    (jury.name?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  const handleAddNewClick = () => {
    setShowAddForm(true);
    setEditingJury(null);
  };

  const handleEditClick = (jury: Jury) => {
    setEditingJury(jury);
    setShowAddForm(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (
      window.confirm(
        getFallbackText(
          t("admin.jury.confirmDelete"),
          "Are you sure you want to delete this jury member? This action cannot be undone."
        )
      )
    ) {
      try {
        // No need to manually update the cache first
        // Just perform the delete operation and let Firestore listener handle the update
        await deleteJury(currentEvent || 'demo-2026', id);
      } catch (error) {
        console.error("Error deleting jury member:", error);
        // Could add error handling UI here
      }
    }
  };

  const handleFormClose = () => {
    setShowAddForm(false);
    setEditingJury(null);
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center">{t("common.loading", "Loading...")}</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with buttons */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">
          {getFallbackText(t("admin.jury.title"), "Jury Management")}
        </h2>
        <div className="flex space-x-4">
          <Button
            onClick={handleAddNewClick}
            className="flex items-center gap-2 border-2 border-primary shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            {getFallbackText(t("admin.jury.addNew"), "Add New Jury Member")}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full md:w-72">
        <Input
          placeholder={getFallbackText(
            t("admin.jury.search"),
            "Search jury members..."
          )}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Jury Members Table */}
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-gray-200">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {getFallbackText(t("admin.jury.table.name"), "Name")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {getFallbackText(
                  t("admin.jury.table.currentQuestion"),
                  "Current Question"
                )}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {getFallbackText(t("admin.jury.table.status"), "Status")}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {getFallbackText(t("admin.jury.table.actions"), "Actions")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-gray-200">
            {filteredJuryMembers.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-4 text-center text-sm text-muted-foreground"
                >
                  {getFallbackText(
                    t("admin.jury.noJuryMembers"),
                    "No jury members found"
                  )}
                </td>
              </tr>
            ) : (
              filteredJuryMembers.map((jury) => (
                <tr key={jury.id} className="hover:bg-muted/50">
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {jury.name}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {jury.currentQuestion}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        jury.hasFinishedEvaluating
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {jury.hasFinishedEvaluating
                        ? t("jury.actions.completed", "Completed")
                        : t("jury.messages.inProgress", "In Progress")}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(jury)}
                        className="h-8 w-8 p-0 border-2"
                        aria-label={t("common.edit", "Edit")}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(jury.id)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 border-2 border-red-200 hover:border-red-500"
                        aria-label={t("common.delete", "Delete")}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 relative border-2 shadow-lg">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFormClose}
              className="absolute top-2 right-2 h-8 w-8 p-0 border-2"
              aria-label={t("common.close", "Close")}
            >
              <X className="h-4 w-4" />
            </Button>
            <JuryForm
              jury={editingJury || undefined}
              onSuccess={handleFormClose}
              onCancel={handleFormClose}
            />
          </Card>
        </div>
      )}
    </div>
  );
};
