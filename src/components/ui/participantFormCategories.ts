import type { EventEvaluationConfigV2 } from "@/evaluation/types";

export interface ParticipantCategoryOption {
  id: string;
  label: string;
  order: number;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function participantCategoryOptions(
  config: EventEvaluationConfigV2 | null
): ParticipantCategoryOption[] {
  if (!config) return [];
  return Object.entries(config.categories)
    .map(([id, category]) => ({
      id,
      label: category.label.default,
      order: category.order,
    }))
    .sort((left, right) => left.order - right.order || compareText(left.id, right.id));
}

export function isParticipantCategoryValid(
  config: EventEvaluationConfigV2 | null,
  categoryId: string
): boolean {
  if (
    !config ||
    !Object.prototype.hasOwnProperty.call(config.categories, categoryId)
  ) return false;
  return config.categories[categoryId].id === categoryId;
}
