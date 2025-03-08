import { useState, useEffect } from "react";
import { Participant } from "@/models/models";
import { useTranslation } from "react-i18next";
import { createParticipant, updateParticipant } from "@/services/participants";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/shadcn/label";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { format, parse } from "date-fns";

interface ParticipantFormProps {
  participant?: Participant;
  onSuccess: () => void;
  onCancel: () => void;
}

export const ParticipantForm = ({
  participant,
  onSuccess,
  onCancel,
}: ParticipantFormProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEditing = !!participant;

  // Form state
  const [formData, setFormData] = useState<
    Omit<Participant, "id" | "assignedQuestions">
  >({
    name: participant?.name || "",
    age: participant?.age || 0,
    country: participant?.country || "",
    category: participant?.category || "",
    school: participant?.school || "",
    scheduled: participant?.scheduled || "",
    isDone: participant?.isDone || false,
    isActive: participant?.isActive || false,
    flag: participant?.flag || "",
    parentsName: participant?.parentsName || "",
    phoneNum: participant?.phoneNum || "",
  });

  // Date and time pickers state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");

  // Parse the initial scheduled time if exists
  useEffect(() => {
    if (participant?.scheduled) {
      try {
        // Try to parse existing scheduled date-time
        const parts = participant.scheduled.split(" ");
        if (parts.length === 2) {
          const datePart = parts[0];
          const timePart = parts[1];

          // Try to parse date in format "YYYY-MM-DD"
          const dateObj = parse(datePart, "yyyy-MM-dd", new Date());
          setSelectedDate(dateObj);
          setSelectedTime(timePart);
        }
      } catch (e) {
        console.error("Could not parse scheduled time:", e);
      }
    }
  }, [participant]);

  // Update scheduled time whenever date or time changes
  useEffect(() => {
    if (selectedDate) {
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      const newScheduled = selectedTime
        ? `${formattedDate} ${selectedTime}`
        : formattedDate;

      setFormData((prev) => ({ ...prev, scheduled: newScheduled }));
    }
  }, [selectedDate, selectedTime]);

  // Form errors state
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    // Handle different input types
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === "number") {
      setFormData((prev) => ({ ...prev, [name]: parseInt(value) || 0 }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t("admin.participants.errors.nameRequired");
    }

    if (formData.age <= 0) {
      newErrors.age = t("admin.participants.errors.invalidAge");
    }

    if (!formData.country.trim()) {
      newErrors.country = t("admin.participants.errors.countryRequired");
    }

    if (!formData.category.trim()) {
      newErrors.category = t("admin.participants.errors.categoryRequired");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (isEditing && participant) {
        await updateParticipant(participant.id, formData);
      } else {
        await createParticipant(formData);
      }

      // Invalidate participants query to refresh data
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      onSuccess();
    } catch (error) {
      console.error("Error saving participant:", error);
      // Handle error (could add error state and display message)
    }
  };

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold mb-4">
        {isEditing
          ? t("admin.participants.editParticipant")
          : t("admin.participants.addParticipant")}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">{t("admin.participants.form.name")}</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
        </div>

        {/* Age */}
        <div className="space-y-2">
          <Label htmlFor="age">{t("admin.participants.form.age")}</Label>
          <Input
            id="age"
            name="age"
            type="number"
            value={formData.age}
            onChange={handleChange}
            className={errors.age ? "border-red-500" : ""}
          />
          {errors.age && <p className="text-red-500 text-sm">{errors.age}</p>}
        </div>

        {/* Country */}
        <div className="space-y-2">
          <Label htmlFor="country">
            {t("admin.participants.form.country")}
          </Label>
          <Input
            id="country"
            name="country"
            value={formData.country}
            onChange={handleChange}
            className={errors.country ? "border-red-500" : ""}
          />
          {errors.country && (
            <p className="text-red-500 text-sm">{errors.country}</p>
          )}
        </div>

        {/* Flag Symbol */}
        <div className="space-y-2">
          <Label htmlFor="flag">{t("admin.participants.form.flag")}</Label>
          <Input
            id="flag"
            name="flag"
            value={formData.flag}
            onChange={handleChange}
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category">
            {t("admin.participants.form.category")}
          </Label>
          <Input
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className={errors.category ? "border-red-500" : ""}
          />
          {errors.category && (
            <p className="text-red-500 text-sm">{errors.category}</p>
          )}
        </div>

        {/* School */}
        <div className="space-y-2">
          <Label htmlFor="school">{t("admin.participants.form.school")}</Label>
          <Input
            id="school"
            name="school"
            value={formData.school}
            onChange={handleChange}
          />
        </div>

        {/* Parent's Name */}
        <div className="space-y-2">
          <Label htmlFor="parentsName">
            {t("admin.participants.form.parentsName")}
          </Label>
          <Input
            id="parentsName"
            name="parentsName"
            value={formData.parentsName}
            onChange={handleChange}
          />
        </div>

        {/* Phone Number */}
        <div className="space-y-2">
          <Label htmlFor="phoneNum">
            {t("admin.participants.form.phoneNum")}
          </Label>
          <Input
            id="phoneNum"
            name="phoneNum"
            value={formData.phoneNum}
            onChange={handleChange}
          />
        </div>

        {/* Scheduled Date */}
        <div className="space-y-2">
          <Label>{t("admin.participants.form.scheduledDate")}</Label>
          <DatePicker value={selectedDate} onChange={handleDateChange} />
        </div>

        {/* Scheduled Time */}
        <div className="space-y-2">
          <Label>{t("admin.participants.form.scheduledTime")}</Label>
          <TimePicker value={selectedTime} onChange={handleTimeChange} />
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="border-2 shadow-sm"
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="border-2 border-primary shadow-sm">
          {isEditing ? t("common.save") : t("common.create")}
        </Button>
      </div>
    </form>
  );
};
