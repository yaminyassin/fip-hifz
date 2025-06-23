import { useState, useCallback, useRef, useEffect } from "react";

/**
 * A hook that provides debounced state updates to prevent excessive re-renders
 * @param initialValue - The initial state value
 * @param delay - Debounce delay in milliseconds (default: 300ms)
 * @returns [state, debouncedSetState, setStateImmediate]
 */
export function useDebouncedState<T>(
    initialValue: T,
    delay: number = 300
): [T, (value: T) => void, (value: T) => void] {
    const [state, setState] = useState<T>(initialValue);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Debounced state setter
    const debouncedSetState = useCallback(
        (value: T) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                setState(value);
                timeoutRef.current = null;
            }, delay);
        },
        [delay]
    );

    // Immediate state setter (bypasses debouncing)
    const setStateImmediate = useCallback((value: T) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setState(value);
    }, []);

    return [state, debouncedSetState, setStateImmediate];
}

/**
 * A hook that batches multiple state updates within a time window
 * @param initialValue - The initial state value
 * @param batchWindow - Time window to batch updates in milliseconds (default: 50ms)
 * @returns [state, batchedSetState]
 */
export function useBatchedState<T>(
    initialValue: T,
    batchWindow: number = 50
): [T, (updater: (prev: T) => T) => void] {
    const [state, setState] = useState<T>(initialValue);
    const pendingUpdatesRef = useRef<((prev: T) => T)[]>([]);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Batched state setter
    const batchedSetState = useCallback(
        (updater: (prev: T) => T) => {
            pendingUpdatesRef.current.push(updater);

            if (!timeoutRef.current) {
                timeoutRef.current = setTimeout(() => {
                    const updates = pendingUpdatesRef.current;
                    pendingUpdatesRef.current = [];
                    timeoutRef.current = null;

                    // Apply all updates in a single state update
                    setState((prevState) => {
                        return updates.reduce((acc, update) => update(acc), prevState);
                    });
                }, batchWindow);
            }
        },
        [batchWindow]
    );

    return [state, batchedSetState];
} 