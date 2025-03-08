import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParticipants } from "@/hooks/useParticipants";
import { Participant } from "@/models/models";
import { Button } from "@/components/shadcn/button";
import { ParticipantForm } from "./ParticipantForm";
import { deleteParticipant } from "@/services/participants";
import { useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Upload, Edit, Trash, X } from "lucide-react";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";

export const ParticipantManagement = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: participants = [], isLoading } = useParticipants();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [showExcelImportPlaceholder, setShowExcelImportPlaceholder] = useState(false);
  
  const filteredParticipants = participants.filter((participant) =>
    participant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    participant.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
    participant.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    participant.school.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleAddNewClick = () => {
    setShowAddForm(true);
    setEditingParticipant(null);
  };
  
  const handleEditClick = (participant: Participant) => {
    setEditingParticipant(participant);
    setShowAddForm(true);
  };
  
  const handleDeleteClick = async (id: string) => {
    if (window.confirm(t("admin.participants.confirmDelete"))) {
      try {
        await deleteParticipant(id);
        queryClient.invalidateQueries({ queryKey: ["participants"] });
      } catch (error) {
        console.error("Error deleting participant:", error);
        // Could add error handling UI here
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
  
  if (isLoading) {
    return <div className="p-4 text-center">{t("common.loading")}</div>;
  }
  
  return (
    <div className="space-y-4">
      {/* Header with buttons */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">{t("admin.participants.title")}</h2>
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
      
      {/* Participants Table */}
      <div className="border-2 rounded-md overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200">
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
                  {t("admin.participants.table.school")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.status")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.participants.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-gray-200">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-sm text-muted-foreground">
                    {t("admin.participants.noParticipants")}
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((participant) => (
                  <tr key={participant.id} className="hover:bg-muted/50">
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {participant.name}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {participant.age}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <span className="inline-flex items-center">
                        <span className="mr-2">{participant.flag}</span>
                        {participant.country}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {participant.category}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {participant.school}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-2">
                        <span 
                          className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            participant.isActive 
                              ? "bg-green-100 text-green-800" 
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {participant.isActive ? t("common.active") : t("common.inactive")}
                        </span>
                        {participant.isDone && (
                          <span className="inline-flex rounded-full px-2 text-xs font-semibold leading-5 bg-blue-100 text-blue-800">
                            {t("common.completed")}
                          </span>
                        )}
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
                          onClick={() => handleDeleteClick(participant.id)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 border-2 border-red-200 hover:border-red-500"
                          aria-label={t("common.delete")}
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
      </div>
      
      {/* Add/Edit Form Modal */}
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
              <h3 className="text-lg font-semibold">{t("admin.participants.importExcel")}</h3>
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
                <Button 
                  type="button" 
                  disabled
                  className="border-2"
                >
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