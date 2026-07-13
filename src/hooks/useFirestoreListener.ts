import { useEffect, useRef } from "react";
import {
    Query,
    DocumentReference,
    onSnapshot,
    Unsubscribe,
    QuerySnapshot,
    DocumentSnapshot,
    FirestoreError
} from "firebase/firestore";

// Global listener registry to prevent duplicate listeners
const activeListeners = new Map<string, {
    unsubscribe: Unsubscribe;
    refCount: number;
    callbacks: Set<(data: any) => void>;
    currentData: any;
}>();

interface UseFirestoreListenerOptions<T> {
    query: Query | DocumentReference | null;
    key: string;
    onData: (data: T) => void;
    onError?: (error: FirestoreError) => void;
    transform?: (snapshot: QuerySnapshot | DocumentSnapshot) => T;
    enabled?: boolean;
}

/**
 * A centralized hook for managing Firestore listeners that prevents duplicate listeners
 * and properly cleans up resources.
 */
export function useFirestoreListener<T>({
    query,
    key,
    onData,
    onError = console.error,
    transform,
    enabled = true
}: UseFirestoreListenerOptions<T>) {
    const unsubscribeRef = useRef<Unsubscribe | null>(null);
    const callbackRef = useRef(onData);

    // Keep callback up to date
    callbackRef.current = onData;

    useEffect(() => {
        if (!query || !enabled) return;

        // Check if we already have an active listener for this key
        const existingListener = activeListeners.get(key);

        if (existingListener) {
            // Add this component's callback to the existing listener
            existingListener.callbacks.add(callbackRef.current);
            existingListener.refCount++;

            // Immediately provide current data if available
            if (existingListener.currentData !== undefined) {
                callbackRef.current(existingListener.currentData);
            }

            return () => {
                // Remove this component's callback
                existingListener.callbacks.delete(callbackRef.current);

                // Decrement reference count on cleanup
                if (existingListener.refCount > 1) {
                    existingListener.refCount--;
                } else {
                    // Last reference, actually unsubscribe
                    existingListener.unsubscribe();
                    activeListeners.delete(key);
                }
            };
        }

        // Create new listener
        let unsubscribe: Unsubscribe;
        const callbacks = new Set<(data: T) => void>();
        callbacks.add(callbackRef.current);

        // Handle both Query and DocumentReference types
        if ('type' in query && query.type === 'query') {
            // It's a Query
            unsubscribe = onSnapshot(
                query as Query,
                {
                    includeMetadataChanges: false
                },
                (snapshot) => {
                    try {
                        const data = transform ? transform(snapshot) : snapshot as T;

                        // Update current data and notify all callbacks
                        const listener = activeListeners.get(key);
                        if (listener) {
                            listener.currentData = data;
                            listener.callbacks.forEach(callback => {
                                try {
                                    callback(data);
                                } catch (error) {
                                    console.error(`Error in callback for ${key}:`, error);
                                }
                            });
                        }
                    } catch (error) {
                        console.error(`Error processing snapshot for ${key}:`, error);
                        onError(error as FirestoreError);
                    }
                },
                (error) => {
                    console.error(`Firestore listener error for ${key}:`, error);
                    onError(error);
                }
            );
        } else {
            // It's a DocumentReference
            unsubscribe = onSnapshot(
                query as DocumentReference,
                {
                    includeMetadataChanges: false
                },
                (snapshot) => {
                    try {
                        const data = transform ? transform(snapshot) : snapshot as T;

                        // Update current data and notify all callbacks
                        const listener = activeListeners.get(key);
                        if (listener) {
                            listener.currentData = data;
                            listener.callbacks.forEach(callback => {
                                try {
                                    callback(data);
                                } catch (error) {
                                    console.error(`Error in callback for ${key}:`, error);
                                }
                            });
                        }
                    } catch (error) {
                        console.error(`Error processing snapshot for ${key}:`, error);
                        onError(error as FirestoreError);
                    }
                },
                (error) => {
                    console.error(`Firestore listener error for ${key}:`, error);
                    onError(error);
                }
            );
        }

        // Store in registry
        activeListeners.set(key, {
            unsubscribe,
            refCount: 1,
            callbacks,
            currentData: undefined
        });

        unsubscribeRef.current = unsubscribe;

        // Cleanup function
        return () => {
            const listener = activeListeners.get(key);
            if (listener) {
                // Remove this component's callback
                listener.callbacks.delete(callbackRef.current);

                if (listener.refCount > 1) {
                    listener.refCount--;
                } else {
                    // Last reference, actually unsubscribe
                    listener.unsubscribe();
                    activeListeners.delete(key);
                }
            }
        };
    }, [query, key, enabled]); // Removed onData from dependencies since we use ref

    // Provide a way to manually refresh the listener
    const refresh = () => {
        if (unsubscribeRef.current && query) {
            unsubscribeRef.current();
            const listener = activeListeners.get(key);
            if (listener) {
                activeListeners.delete(key);
            }
            // The useEffect will automatically create a new listener
        }
    };

    return { refresh };
}

// Helper function to get listener stats (useful for debugging)
export function getListenerStats() {
    const stats: Record<string, number> = {};
    activeListeners.forEach((listener, key) => {
        stats[key] = listener.refCount;
    });
    return stats;
}

// Clean up all listeners (useful for logout or major state changes)
export function cleanupAllListeners() {
    activeListeners.forEach((listener) => {
        listener.unsubscribe();
    });
    activeListeners.clear();
} 