import { useState, useEffect, ChangeEvent, DragEvent } from "react";
import { Participant } from "@/models/models";
import { useTranslation } from "react-i18next";
import { createParticipant, updateParticipant } from "@/services/participants";
import { useEvent } from "@/contexts/EventContext";
import { notifyError, notifySuccess, NOTIFY_KEYS } from "@/lib/notify";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Upload, X } from "lucide-react";
import { getAvailableCountries, getFlagForCountry } from "@/lib/countryUtils";
import {
  generateParticipantId,
  participantIdValidationError,
} from "@/lib/participantId";
import {
  isParticipantCategoryValid,
  participantCategoryOptions,
} from "./participantFormCategories";

// Available days and times for scheduling
const AVAILABLE_DAYS = [
  { value: "S1", label: "Monday" },
  { value: "S2", label: "Tuesday" },
  { value: "S3", label: "Wednesday" },
  { value: "S4", label: "Thursday" },
  { value: "S5", label: "Friday" },
  { value: "S6", label: "Saturday" },
  { value: "S7", label: "Sunday" },
];

const AVAILABLE_TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
];

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
  const {
    currentEvent,
    evaluationConfig,
    evaluationConfigStatus,
  } = useEvent();
  const queryClient = useQueryClient();
  const categoryOptions = participantCategoryOptions(evaluationConfig);
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
    activeQuestion: participant?.activeQuestion || 0,
    flag:
      participant?.flag ||
      (participant?.country
        ? getFlagForCountry(participant.country) || ""
        : ""),
    parentsName: participant?.parentsName || "",
    phoneNum: participant?.phoneNum || "",
    email: participant?.email || "",
    photo: participant?.photo || "",
  });

  // Day and time selection state
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");

  // Photo preview state
  const [photoPreview, setPhotoPreview] = useState<string | null>(() => {
    // If participant has a photo, create a proper data URL
    if (participant?.photo && participant.photo.trim()) {
      // Check if it's already a data URL or just base64 string
      if (participant.photo.startsWith("data:")) {
        return participant.photo;
      } else {
        // Validate that it looks like base64 data before creating data URL
        try {
          // Basic validation for base64 string
          const base64Regex = /^[A-Za-z0-9+/]+=*$/;
          if (base64Regex.test(participant.photo.replace(/\s/g, ""))) {
            return `data:image/jpeg;base64,${participant.photo}`;
          }
        } catch {
          console.warn("Invalid photo data for participant:", participant.name);
        }
      }
    }
    return null;
  });

  // Drag and drop state for photo
  const [isPhotoDragOver, setIsPhotoDragOver] = useState(false);

  // Parse the initial scheduled day/time if exists
  useEffect(() => {
    if (participant?.scheduled && participant.scheduled.trim()) {
      try {
        // Parse format like "S6: Saturday afternoon"
        const scheduled = participant.scheduled.trim();

        // Extract day code (S1, S2, etc.) and time
        const match = scheduled.match(/^(S\d+):\s*(\w+)\s+(\w+)$/i);
        if (match) {
          const [, dayCode, , timeOfDay] = match;
          setSelectedDay(dayCode);
          setSelectedTime(timeOfDay.toLowerCase());
        } else {
          console.warn(
            "Could not parse scheduled format:",
            participant.scheduled
          );
          setSelectedDay("");
          setSelectedTime("");
        }
      } catch (e) {
        console.error("Could not parse scheduled field:", e);
        setSelectedDay("");
        setSelectedTime("");
      }
    } else {
      setSelectedDay("");
      setSelectedTime("");
    }
  }, [participant]);

  // Update scheduled field whenever day or time changes
  useEffect(() => {
    if (selectedDay && selectedTime) {
      const dayData = AVAILABLE_DAYS.find((d) => d.value === selectedDay);
      if (dayData) {
        const scheduledString = `${selectedDay}: ${dayData.label} ${selectedTime}`;
        setFormData((prev) => ({ ...prev, scheduled: scheduledString }));
      }
    } else if (!selectedDay && !selectedTime) {
      setFormData((prev) => ({ ...prev, scheduled: "" }));
    }
  }, [selectedDay, selectedTime]);

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

  // Handle category selection
  const handleCategoryChange = (value: string) => {
    setFormData((prev) => ({ ...prev, category: value }));
  };

  // Function to convert file to base64
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64String = result.split(",")[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle photo upload (both file input and drag & drop)
  const handlePhotoUpload = async (file: File) => {
    try {
      // Check if file is an image
      if (!file.type.startsWith("image/")) {
        setErrors((current) => ({
          ...current,
          photo: t("admin.participants.errors.invalidImageType"),
        }));
        return;
      }

      // Check file size (limit to 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setErrors((current) => ({
          ...current,
          photo: t("admin.participants.errors.imageTooLarge"),
        }));
        return;
      }

      // Convert to base64
      const base64String = await convertFileToBase64(file);

      // Update form data with just the base64 string (no data URL prefix)
      setFormData((prev) => ({
        ...prev,
        photo: base64String,
      }));

      // Set photo preview with full data URL for display
      const dataURL = `data:${file.type};base64,${base64String}`;
      setPhotoPreview(dataURL);
      setErrors((current) => {
        const next = { ...current };
        delete next.photo;
        return next;
      });
    } catch (error) {
      console.error("Error processing image:", error);
      setErrors((current) => ({
        ...current,
        photo: t("admin.participants.errors.imageProcessingError"),
      }));
    }
  };

  // Handle photo file input change
  const handlePhotoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handlePhotoUpload(file);
    }
  };

  // Handle drag and drop for photo
  const handlePhotoDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsPhotoDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handlePhotoUpload(files[0]);
    }
  };

  const handlePhotoDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsPhotoDragOver(true);
  };

  const handlePhotoDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsPhotoDragOver(false);
  };

  // Remove photo
  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, photo: "" }));
    setPhotoPreview(null);
  };

  // Handle country selection
  const handleCountryChange = (countryName: string) => {
    // Set the country name and automatically derive flag emoji
    const flagEmoji = getFlagForCountry(countryName) || "";
    setFormData((prev) => ({
      ...prev,
      country: countryName,
      flag: flagEmoji, // Store flag emoji instead of base64 data
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t("admin.participants.errors.nameRequired");
    } else if (!isEditing) {
      // Editing keeps the existing document id (no rename), so only a new
      // participant's name has to yield a valid id.
      const idError = participantIdValidationError(generateParticipantId(formData.name));
      if (idError) newErrors.name = idError;
    }

    if (formData.age <= 0) {
      newErrors.age = t("admin.participants.errors.invalidAge");
    }

    if (!formData.country.trim()) {
      newErrors.country = t("admin.participants.errors.countryRequired");
    }

    if (!formData.category.trim()) {
      newErrors.category = t("admin.participants.errors.categoryRequired");
    } else if (
      evaluationConfigStatus !== "ready" ||
      !isParticipantCategoryValid(evaluationConfig, formData.category)
    ) {
      newErrors.category = t("admin.participants.errors.categoryInvalid", {
        defaultValue: "Select a category from this event's evaluation config",
      });
    }

    // Validate email if provided
    if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
      newErrors.email = t("admin.participants.errors.invalidEmail");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !currentEvent) {
      return;
    }

    try {
      if (isEditing && participant) {
        await updateParticipant(currentEvent, participant.id, formData);
      } else {
        await createParticipant(currentEvent, formData);
      }

      // Invalidate participants query to refresh data
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      notifySuccess({
        key: NOTIFY_KEYS.participantSave,
        title: isEditing
          ? t("admin.participants.updatedTitle")
          : t("admin.participants.createdTitle"),
        description: t("admin.participants.savedDesc", { name: formData.name }),
      });
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error saving participant:", error);
      setErrors((current) => ({ ...current, submit: message }));
      notifyError({
        key: NOTIFY_KEYS.participantSave,
        title: t("admin.participants.saveFailedTitle"),
        description: t("admin.participants.saveFailedDesc", {
          name: formData.name,
          reason: message,
        }),
      });
    }
  };

  const handleDayChange = (day: string) => {
    setSelectedDay(day);
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
            min="1"
            max="150"
            step="1"
            value={formData.age || ""}
            onChange={handleChange}
            className={errors.age ? "border-red-500" : ""}
            placeholder={t("admin.participants.form.agePlaceholder")}
          />
          {errors.age && <p className="text-red-500 text-sm">{errors.age}</p>}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">{t("admin.participants.form.email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email || ""}
            onChange={handleChange}
            className={errors.email ? "border-red-500" : ""}
          />
          {errors.email && (
            <p className="text-red-500 text-sm">{errors.email}</p>
          )}
        </div>

        {/* Country Selection with Flag Preview */}
        <div className="space-y-2 col-span-2">
          <Label>{t("admin.participants.form.country")}</Label>
          <Select value={formData.country} onValueChange={handleCountryChange}>
            <SelectTrigger className={errors.country ? "border-red-500" : ""}>
              <SelectValue placeholder={t("admin.participants.form.countryPlaceholder")}>
                {formData.country ? (
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {getFlagForCountry(formData.country)}
                    </span>
                    <span>{formData.country}</span>
                  </div>
                ) : (
                  t("admin.participants.form.countryPlaceholder")
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {getAvailableCountries().map((country) => (
                <SelectItem key={country.name} value={country.name}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{country.flag}</span>
                    <span>{country.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.country && (
            <p className="text-red-500 text-sm">{errors.country}</p>
          )}
        </div>

        {/* Category Dropdown */}
        <div className="space-y-2">
          <Label htmlFor="category">
            {t("admin.participants.form.category")}
          </Label>
          <Select
            value={formData.category}
            onValueChange={handleCategoryChange}
            disabled={evaluationConfigStatus !== "ready"}
          >
            <SelectTrigger className={errors.category ? "border-red-500" : ""}>
              <SelectValue placeholder={t("admin.participants.form.categoryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        {/* Participant Photo with Drag & Drop */}
        <div className="space-y-2 col-span-2">
          <Label>
            {t("admin.participants.form.photo", "Participant Photo")}
          </Label>
          <div
            className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
              isPhotoDragOver
                ? "border-primary bg-primary/5"
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDrop={handlePhotoDrop}
            onDragOver={handlePhotoDragOver}
            onDragLeave={handlePhotoDragLeave}
          >
            {photoPreview ? (
              <div className="flex items-center justify-center space-x-4">
                <div className="w-24 h-24 border rounded overflow-hidden">
                  <img
                    src={photoPreview}
                    alt={t("admin.participants.form.photoAlt")}
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemovePhoto}
                  className="flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Remove Photo
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <input
                  type="file"
                  className="hidden"
                  id="photo-file-input"
                  accept="image/*"
                  onChange={handlePhotoFileChange}
                />
                <label
                  htmlFor="photo-file-input"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  <Upload className="h-10 w-10 text-gray-400 mb-2" />
                  <span className="text-sm text-muted-foreground">
                    Drop participant photo here or click to upload
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    Supports PNG, JPG (Max 2MB)
                  </span>
                </label>
              </div>
            )}
          </div>
          {errors.photo && (
            <p className="text-red-500 text-sm" role="alert">
              {errors.photo}
            </p>
          )}
        </div>

        {/* Scheduled Day */}
        <div className="space-y-2">
          <Label>
            {t("admin.participants.form.scheduledDay", "Scheduled Day")}
          </Label>
          <Select value={selectedDay} onValueChange={handleDayChange}>
            <SelectTrigger>
              <SelectValue placeholder={t("admin.participants.form.dayPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_DAYS.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.value}: {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Scheduled Time */}
        <div className="space-y-2">
          <Label>
            {t("admin.participants.form.scheduledTime", "Scheduled Time")}
          </Label>
          <Select value={selectedTime} onValueChange={handleTimeChange}>
            <SelectTrigger>
              <SelectValue placeholder={t("admin.participants.form.timePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_TIMES.map((time) => (
                <SelectItem key={time.value} value={time.value}>
                  {time.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}

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
