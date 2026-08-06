/**
 * Utility functions for building event-scoped Firestore paths
 */

/**
 * Build a Firestore collection path scoped to a specific event
 * @param eventId - The event identifier (e.g., 'demo-2026')
 * @param collectionName - The collection name (e.g., 'participants')
 * @returns The full collection path (e.g., 'events/demo-2026/participants')
 */
export const getEventCollectionPath = (eventId: string, collectionName: string): string => {
  return `events/${eventId}/${collectionName}`;
};