import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/main';
import {
  loadEvaluationConfig,
  type EvaluationConfigReaders,
  type LoadEvaluationConfigResult,
} from '@/evaluation/eventDescriptor';
import type {
  EventEvaluationConfigV2,
  EventEvaluationDescriptorV2,
} from '@/evaluation/types';

/**
 * Config loading seam (docs/migrations/phase-1-evaluation-model.md section
 * 2, "Event metadata and config loading"): the event's evaluation config is
 * loaded exactly once per `currentEvent` change, and the previous event's
 * compiled config is cleared before the new one resolves. Consumers that
 * need the config read `evaluationConfigStatus === 'ready'` and
 * `evaluationConfig`; nothing here silently falls back to a default config
 * or a default category.
 *
 * Phase 1a trial scope: this seam is built and independently testable
 * (src/evaluation/__tests__/eventDescriptor.test.ts, e2e config-loading
 * coverage), but gating every consumer on `evaluationConfigStatus` is
 * deferred scale-out work — existing consumers keep reading `currentEvent`
 * exactly as before.
 */
export type EvaluationConfigStatus = 'idle' | 'loading' | 'ready' | 'failClosed';

interface EventContextType {
  currentEvent: string | null;
  setCurrentEvent: (event: string) => void;
  isEventLoaded: boolean;
  evaluationConfigStatus: EvaluationConfigStatus;
  evaluationConfig: EventEvaluationConfigV2 | null;
  evaluationDescriptor: EventEvaluationDescriptorV2 | null;
  evaluationConfigError: string | null;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export const useEvent = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
};

interface EventProviderProps {
  children: React.ReactNode;
}

function firestoreEvaluationReaders(eventId: string): EvaluationConfigReaders {
  return {
    getEventDocument: async () => {
      const snapshot = await getDoc(doc(firestore, 'events', eventId));
      return snapshot.exists() ? snapshot.data() : undefined;
    },
    getConfigDocument: async (configPath: string) => {
      try {
        const snapshot = await getDoc(doc(firestore, configPath));
        return snapshot.exists() ? snapshot.data() : undefined;
      } catch {
        // A read error (permission denied, transient failure, etc.) is
        // treated the same as "missing" — the ONLY fallback trigger.
        return undefined;
      }
    },
  };
}

export const EventProvider: React.FC<EventProviderProps> = ({ children }) => {
  const [currentEvent, setCurrentEvent] = useState<string | null>(null);
  const [isEventLoaded, setIsEventLoaded] = useState(false);
  const [evaluationConfigStatus, setEvaluationConfigStatus] =
    useState<EvaluationConfigStatus>('idle');
  const [evaluationConfig, setEvaluationConfig] = useState<EventEvaluationConfigV2 | null>(
    null
  );
  const [evaluationDescriptor, setEvaluationDescriptor] =
    useState<EventEvaluationDescriptorV2 | null>(null);
  const [evaluationConfigError, setEvaluationConfigError] = useState<string | null>(null);

  useEffect(() => {
    // Get event from URL query parameter (e.g., /admin?event=lisbon-2025)
    const urlParams = new URLSearchParams(window.location.search);
    const eventFromUrl = urlParams.get('event');

    if (eventFromUrl) {
      setCurrentEvent(eventFromUrl);
    } else {
      // Only default to lisbon-2025 if on a non-root page
      if (window.location.pathname !== '/') {
        setCurrentEvent('lisbon-2025');
      }
    }
    setIsEventLoaded(true);

    // Listen for URL changes
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const eventFromUrl = urlParams.get('event');
      if (eventFromUrl) {
        setCurrentEvent(eventFromUrl);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load (or clear) the event's evaluation config whenever currentEvent
  // changes. Clears the previous event's compiled config synchronously,
  // before the new one resolves, so a stale config is never read across an
  // event switch.
  useEffect(() => {
    setEvaluationConfig(null);
    setEvaluationDescriptor(null);
    setEvaluationConfigError(null);

    if (!currentEvent) {
      setEvaluationConfigStatus('idle');
      return;
    }

    let cancelled = false;
    setEvaluationConfigStatus('loading');

    loadEvaluationConfig(currentEvent, firestoreEvaluationReaders(currentEvent))
      .then((result: LoadEvaluationConfigResult) => {
        if (cancelled) return;
        if (result.status === 'ready') {
          setEvaluationConfig(result.config);
          setEvaluationDescriptor(result.descriptor);
          setEvaluationConfigStatus('ready');
        } else {
          setEvaluationConfigError(result.reason);
          setEvaluationConfigStatus('failClosed');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEvaluationConfigError(
          error instanceof Error ? error.message : 'Unknown evaluation config load error'
        );
        setEvaluationConfigStatus('failClosed');
      });

    return () => {
      cancelled = true;
    };
  }, [currentEvent]);

  const handleSetCurrentEvent = (event: string) => {
    setCurrentEvent(event);
    // Update URL query parameter when event changes
    const url = new URL(window.location.href);
    url.searchParams.set('event', event);
    window.history.pushState({}, '', url.toString());
  };

  return (
    <EventContext.Provider
      value={{
        currentEvent,
        setCurrentEvent: handleSetCurrentEvent,
        isEventLoaded,
        evaluationConfigStatus,
        evaluationConfig,
        evaluationDescriptor,
        evaluationConfigError,
      }}
    >
      {children}
    </EventContext.Provider>
  );
};
