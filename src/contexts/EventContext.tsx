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
 * Config loading seam (docs/migrations/phase-1-greenfield.md section 1,
 * "Config storage model" + section 2, "Gating"): the event's evaluation
 * config is loaded exactly once per `currentEvent` change (one-shot
 * `getDoc`, not a subscription — config is immutable per event until the
 * Phase 2 editor exists), and the previous event's compiled config is
 * cleared synchronously before the new one resolves. Consumers that need
 * the config read `evaluationConfigStatus === 'ready'` and
 * `evaluationConfig`; nothing here (or anywhere downstream) falls back to a
 * default config or a default category. `<EvaluationConfigGate>`
 * (src/components/EvaluationConfigGate.tsx) is the render-blocking gate that
 * every scored route wraps itself in.
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

/**
 * The last explicitly-selected event is persisted so an event-less URL on a
 * non-root route (a reload, or a second tab/window on the SAME browser — e.g.
 * a /quran-page display) recovers the operator's event instead of failing
 * closed. localStorage is per-browser, so a genuinely separate device still
 * needs ?event= in the URL (in-app navigation always includes it). This is
 * persistent identity, never a hardcoded default; see EventProvider's mount
 * effect.
 */
const CURRENT_EVENT_STORAGE_KEY = 'fip-hifz.currentEvent';

function readPersistedEvent(): string | null {
  try {
    return localStorage.getItem(CURRENT_EVENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistEvent(event: string): void {
  try {
    localStorage.setItem(CURRENT_EVENT_STORAGE_KEY, event);
  } catch {
    // Storage unavailable (private mode / disabled): persistence is a
    // convenience, not a correctness requirement; the URL param still works.
  }
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

  // The event whose config/status the state above currently reflects.
  // Compared against `currentEvent` on every render (not in an effect) so
  // the previous event's compiled config is discarded in the SAME render
  // that first sees the new `currentEvent` — never one render/paint later.
  // This is React's documented "adjust state during rendering" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // calling setState here bails out of committing/painting this render and
  // immediately re-renders with the reset state, so a stale-config frame
  // (old event's scored content momentarily rendered for the new event) is
  // never shown, unlike clearing in a `useEffect`, which runs after commit
  // and can paint once with mismatched event/config.
  const [configEvent, setConfigEvent] = useState<string | null>(null);
  if (configEvent !== currentEvent) {
    setConfigEvent(currentEvent);
    setEvaluationConfig(null);
    setEvaluationDescriptor(null);
    setEvaluationConfigError(null);
    setEvaluationConfigStatus(currentEvent ? 'loading' : 'idle');
  }

  useEffect(() => {
    // Get event from URL query parameter (e.g., /admin?event=demo-2026)
    const urlParams = new URLSearchParams(window.location.search);
    const eventFromUrl = urlParams.get('event');

    if (eventFromUrl) {
      setCurrentEvent(eventFromUrl);
      persistEvent(eventFromUrl);
    } else if (window.location.pathname !== '/') {
      // A non-root scored/display route opened without ?event= (a reload, or a
      // second tab/window on the same browser — e.g. a /quran-page display).
      // Restore the operator's last explicitly-selected event — persistent
      // identity, NOT a hardcoded trial event — and reflect it into the URL so
      // reloads and links stay stable. If nothing was ever selected,
      // currentEvent stays null and <EvaluationConfigGate> fails closed ("No
      // event selected"). Combined with dropping the demo-2026 default, this is
      // the Phase 6 /quran-page fix: an event-less URL no longer shows the
      // wrong event's (absent) active participant. A separate device still
      // needs ?event= in the URL, which in-app navigation includes.
      const persisted = readPersistedEvent();
      if (persisted) {
        setCurrentEvent(persisted);
        const url = new URL(window.location.href);
        url.searchParams.set('event', persisted);
        window.history.replaceState({}, '', url.toString());
      }
    }
    // On the root route with no ?event=, currentEvent stays null and the
    // event selector is shown; nothing is defaulted.
    setIsEventLoaded(true);

    // Listen for URL changes
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nextEvent = params.get('event');
      if (nextEvent) {
        setCurrentEvent(nextEvent);
        persistEvent(nextEvent);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch the event's evaluation config whenever currentEvent changes. The
  // previous event's compiled config/status is already reset synchronously
  // above (in the render-phase `configEvent` check) by the time this effect
  // runs, so this effect only owns the async fetch and its resolution.
  useEffect(() => {
    if (!currentEvent) {
      return;
    }

    let cancelled = false;

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
    persistEvent(event);
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
