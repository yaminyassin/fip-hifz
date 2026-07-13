/**
 * Utility functions for building event-scoped Firestore paths
 */

/**
 * Build a Firestore collection path scoped to a specific event
 * @param eventId - The event identifier (e.g., 'lisbon-2025')
 * @param collectionName - The collection name (e.g., 'participants')
 * @returns The full collection path (e.g., 'events/lisbon-2025/participants')
 */
export const getEventCollectionPath = (eventId: string, collectionName: string): string => {
  return `events/${eventId}/${collectionName}`;
};