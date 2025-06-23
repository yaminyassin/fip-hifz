import { useEffect, useRef } from "react";
import {
    Query,
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
}>();

interface UseFirestoreListenerOptions<T> {
    query: Query | null;
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

    useEffect(() => {
        if (!query || !enabled) return;

        // Check if we already have an active listener for this key
        const existingListener = activeListeners.get(key);

        if (existingListener) {
            // Increment reference count
            existingListener.refCount++;
            console.log(`[FirestoreListener] Reusing existing listener for ${key}, refCount: ${existingListener.refCount}`);
            return () => {
                // Decrement reference count on cleanup
                if (existingListener.refCount > 1) {
                    existingListener.refCount--;
                    console.log(`[FirestoreListener] Decremented refCount for ${key}, new count: ${existingListener.refCount}`);
                } else {
                    // Last reference, actually unsubscribe
                    existingListener.unsubscribe();
                    activeListeners.delete(key);
                    console.log(`[FirestoreListener] Removed listener for ${key}`);
                }
            };
        }

        // Create new listener
        console.log(`[FirestoreListener] Creating new listener for ${key}`);

        const unsubscribe = onSnapshot(
            query,
            {
                // Add metadata options for better performance
                includeMetadataChanges: false
            },
            (snapshot) => {
                try {
                    const data = transform ? transform(snapshot) : snapshot as T;
                    onData(data);
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

        // Store in registry
        activeListeners.set(key, {
            unsubscribe,
            refCount: 1
        });

        unsubscribeRef.current = unsubscribe;

        // Cleanup function
        return () => {
            const listener = activeListeners.get(key);
            if (listener) {
                if (listener.refCount > 1) {
                    listener.refCount--;
                    console.log(`[FirestoreListener] Decremented refCount for ${key}, new count: ${listener.refCount}`);
                } else {
                    // Last reference, actually unsubscribe
                    listener.unsubscribe();
                    activeListeners.delete(key);
                    console.log(`[FirestoreListener] Removed listener for ${key}`);
                }
            }
        };
    }, [query, key, enabled]);

    // Provide a way to manually refresh the listener
    const refresh = () => {
        if (unsubscribeRef.current && query) {
            console.log(`[FirestoreListener] Manually refreshing listener for ${key}`);
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
    console.log(`[FirestoreListener] Cleaning up all ${activeListeners.size} listeners`);
    activeListeners.forEach((listener, key) => {
        listener.unsubscribe();
        console.log(`[FirestoreListener] Cleaned up listener for ${key}`);
    });
    activeListeners.clear();
} 