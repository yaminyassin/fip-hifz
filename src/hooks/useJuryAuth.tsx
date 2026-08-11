import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { collection, doc, type DocumentSnapshot } from "firebase/firestore";

import { useEvent } from "@/contexts/EventContext";
import { firestore } from "@/main";
import type { Jury } from "@/models/models";
import {
  authenticateJury,
  clearAuthenticatedJury,
  deactivateJurySession,
  getAuthenticatedJury,
  logoutJury,
} from "@/services/juryAuth";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import {
  cleanupAllListeners,
  useFirestoreListener,
} from "./useFirestoreListener";

type JuryAuthState =
  | { kind: "anonymous"; eventId: string | null }
  | { kind: "checking"; eventId: string; juryId: string }
  | { kind: "authenticated"; eventId: string; juryId: string };

type StoredJury = Omit<Jury, "id"> & { id?: string };

function isStoredJury(value: unknown): value is StoredJury {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "currentQuestion" in value &&
    typeof value.currentQuestion === "number" &&
    Number.isInteger(value.currentQuestion) &&
    "hasFinishedEvaluating" in value &&
    typeof value.hasFinishedEvaluating === "boolean" &&
    "isActive" in value &&
    typeof value.isActive === "boolean" &&
    (!("id" in value) || typeof value.id === "string")
  );
}

function storedJuryState(eventId: string | null): JuryAuthState {
  if (!eventId) return { kind: "anonymous", eventId: null };

  const juryId = getAuthenticatedJury(eventId);
  return juryId
    ? { kind: "checking", eventId, juryId }
    : { kind: "anonymous", eventId };
}

export const useJuryAuth = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentEvent } = useEvent();
  const [authState, setAuthState] = useState<JuryAuthState>(() =>
    storedJuryState(currentEvent)
  );

  useEffect(() => {
    setAuthState(storedJuryState(currentEvent));
  }, [currentEvent]);

  const stateMatchesEvent = authState.eventId === currentEvent;
  const juryId =
    stateMatchesEvent && authState.kind !== "anonymous"
      ? authState.juryId
      : null;
  const isAuthenticated =
    stateMatchesEvent && authState.kind === "authenticated";
  const isChecking =
    !!currentEvent && (!stateMatchesEvent || authState.kind === "checking");

  useEffect(() => {
    if (
      !currentEvent ||
      authState.kind !== "checking" ||
      authState.eventId !== currentEvent
    ) {
      return;
    }

    const restoringJuryId = authState.juryId;
    let cancelled = false;

    void authenticateJury(currentEvent, restoringJuryId).then((jury) => {
      if (cancelled) return;

      if (!jury) {
        clearAuthenticatedJury(currentEvent);
        setAuthState({ kind: "anonymous", eventId: currentEvent });
        return;
      }

      queryClient.setQueryData(
        ["jury", currentEvent, restoringJuryId],
        jury
      );
      setAuthState({
        kind: "authenticated",
        eventId: currentEvent,
        juryId: restoringJuryId,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authState, currentEvent, queryClient]);

  useEffect(() => {
    if (!currentEvent || !juryId || !isAuthenticated) return;

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;

      void deactivateJurySession(currentEvent, juryId).catch((error) => {
        console.error("Error deactivating jury session:", error);
      });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [currentEvent, isAuthenticated, juryId]);

  const juryQuery = useMemo(() => {
    if (!juryId || !currentEvent || !isAuthenticated) return null;
    const juryCollection = collection(
      firestore,
      getEventCollectionPath(currentEvent, "jury")
    );
    return doc(juryCollection, juryId);
  }, [juryId, currentEvent, isAuthenticated]);

  useFirestoreListener<DocumentSnapshot>({
    query: juryQuery,
    key: `jury-member-${currentEvent}-${juryId}`,
    onData: (docSnapshot) => {
      if (!currentEvent || !juryId) return;

      if (!docSnapshot.exists()) {
        clearAuthenticatedJury(currentEvent);
        queryClient.setQueryData(["jury", currentEvent, juryId], null);
        setAuthState({ kind: "anonymous", eventId: currentEvent });
        return;
      }

      const storedJury = docSnapshot.data();
      if (!isStoredJury(storedJury)) {
        console.error("Stored jury document has an invalid shape");
        clearAuthenticatedJury(currentEvent);
        queryClient.setQueryData(["jury", currentEvent, juryId], null);
        setAuthState({ kind: "anonymous", eventId: currentEvent });
        return;
      }

      const juryMember: Jury = {
        ...storedJury,
        id: docSnapshot.id,
      };
      queryClient.setQueryData(
        ["jury", currentEvent, juryId],
        juryMember
      );
      setAuthState({
        kind: "authenticated",
        eventId: currentEvent,
        juryId,
      });
    },
    onError: (error) => {
      console.error("Error validating jury session:", error);
      if (!currentEvent) return;
      clearAuthenticatedJury(currentEvent);
      setAuthState({ kind: "anonymous", eventId: currentEvent });
    },
    enabled: !!juryQuery,
  });

  const { data: juryMember } = useQuery<Jury | null>({
    queryKey: ["jury", currentEvent, juryId],
    queryFn: () =>
      queryClient.getQueryData<Jury | null>([
        "jury",
        currentEvent,
        juryId,
      ]) ?? null,
    enabled: !!juryId && !!currentEvent,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const handleLoginSuccess = (jury: Jury) => {
    if (!currentEvent) return;
    queryClient.setQueryData(["jury", currentEvent, jury.id], jury);
    setAuthState({
      kind: "authenticated",
      eventId: currentEvent,
      juryId: jury.id,
    });
  };

  const handleLogout = async () => {
    if (!currentEvent) return;

    try {
      await logoutJury(currentEvent);
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      setAuthState({ kind: "anonymous", eventId: currentEvent });
      cleanupAllListeners();
      queryClient.clear();
      navigate({ to: "/" });
    }
  };

  return {
    isAuthenticated,
    isChecking,
    juryId,
    juryMember,
    handleLoginSuccess,
    handleLogout,
  };
};
