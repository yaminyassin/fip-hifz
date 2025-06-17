import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Jury } from "@/models/models";
import { addJury, updateJury } from "@/services/jury";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";

// Function to get fallback text when translations are missing
const getFallbackText = (key: string, defaultText: string) => {
  return key.startsWith("admin.jury") ? defaultText : key;
};

interface JuryFormProps {
  jury?: Jury;
  onSuccess: () => void;
  onCancel: () => void;
}

export const JuryForm = ({ jury, onSuccess, onCancel }: JuryFormProps) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
  }>({
    name: jury?.name || "",
  });

  const [errors, setErrors] = useState<{
    name?: string;
  }>({});

  const validateForm = (): boolean => {
    const newErrors: { name?: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = t("validation.required", "This field is required");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (jury) {
        // Update existing jury member
        await updateJury(jury.id, {
          name: formData.name,
        });

        // No need to manually update the cache for updates
        // The Firestore listener in useJuryMembers will handle it
      } else {
        // Add new jury member
        await addJury({
          name: formData.name,
          currentQuestion: 1,
          hasFinishedEvaluating: false,
          isActive: true,
        });

        // No need to manually add to the cache
        // The Firestore listener in useJuryMembers will add it
      }

      // Invalidate the query to ensure data is fresh
      // Removed invalidateQueries since the real-time Firebase listener will handle updates
      onSuccess();
    } catch (error) {
      console.error("Error saving jury member:", error);
      // Add error handling here if needed
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">
          {jury
            ? getFallbackText(t("admin.jury.editJury"), "Edit Jury Member")
            : getFallbackText(
                t("admin.jury.addNewJury"),
                "Add New Jury Member"
              )}
        </h3>
        <p className="text-sm text-muted-foreground">
          {jury
            ? getFallbackText(
                t("admin.jury.editJuryDescription"),
                "Update the details of the jury member."
              )
            : getFallbackText(
                t("admin.jury.addJuryDescription"),
                "Add a new jury member to the system."
              )}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            {getFallbackText(t("admin.jury.form.name"), "Name")}
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder={getFallbackText(
              t("admin.jury.form.namePlaceholder"),
              "Enter jury member name"
            )}
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="border-2"
          disabled={isSubmitting}
        >
          {t("common.cancel", "Cancel")}
        </Button>
        <Button
          type="submit"
          className="border-2 border-primary shadow-sm"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? t("common.saving", "Saving...")
            : jury
              ? t("common.update", "Update")
              : t("common.save", "Save")}
        </Button>
      </div>
    </form>
  );
};
