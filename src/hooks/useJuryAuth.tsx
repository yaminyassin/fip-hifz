import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { doc, DocumentSnapshot, collection } from "firebase/firestore";
import { firestore } from "@/main";
import { getAuthenticatedJury, logoutJury } from "../services/juryAuth";
import { Jury } from "../models/models";
import { cleanupAllListeners, useFirestoreListener } from "./useFirestoreListener";
import { useEvent } from "@/contexts/EventContext";
import { getEventCollectionPath } from "@/utils/firebaseUtils";

export const useJuryAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentEvent } = useEvent();

  // Check authentication on mount
  useEffect(() => {
    const juryId = getAuthenticatedJury();
    setIsAuthenticated(!!juryId);
  }, []);

  // Handle browser close/refresh to deactivate jury member
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!currentEvent) return;
      const juryId = getAuthenticatedJury();
      if (juryId) {
        // Use sendBeacon for reliable request during page unload
        // Note: This would require a server endpoint, so for now we'll use the simple approach
        // and accept that some cases might not deactivate properly
        try {
          // For immediate deactivation, we'll trigger the logout
          // This might not always complete but it's better than nothing
          logoutJury(currentEvent).catch(console.error);
        } catch (error) {
          console.error("Error deactivating jury on page unload:", error);
        }
      }
    };

    // Handle browser close/refresh
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const juryId = getAuthenticatedJury();

  // Memoize the query to prevent recreation on every render
  const juryQuery = useMemo(() => {
    if (!juryId || !currentEvent) return null;
    const juryCollection = collection(firestore, getEventCollectionPath(currentEvent, "jury"));
    return doc(juryCollection, juryId);
  }, [juryId, currentEvent]);

  // Use centralized listener for jury member data
  useFirestoreListener<DocumentSnapshot>({
    query: juryQuery,
    key: `jury-member-${currentEvent}-${juryId}`, // Use same key as useJuryMember for consistency
    onData: (docSnapshot) => {
      if (docSnapshot.exists()) {
        const juryMember = {
          id: docSnapshot.id,
          ...docSnapshot.data(),
        } as Jury;
        // console.log(`[useJuryAuth] Setting jury data:`, juryMember);
        queryClient.setQueryData(["jury", currentEvent, juryId], juryMember);
      } else {
        // console.log(`[useJuryAuth] Setting jury data to null`);
        queryClient.setQueryData(["jury", currentEvent, juryId], null);
      }
    },
    onError: (error) => {
      console.error("Error fetching jury member:", error);
    },
    enabled: !!juryQuery
  });

  const { data: juryMember } = useQuery<Jury | null>({
    queryKey: ["jury", currentEvent, juryId],
    queryFn: () => {
      // Return cached data if available, otherwise null
      const cachedData = queryClient.getQueryData<Jury | null>(["jury", currentEvent, juryId]);
      return cachedData || null;
    },
    enabled: !!juryId && !!currentEvent,
    staleTime: Infinity, // Never mark as stale since we're using real-time updates
    refetchOnMount: false, // Don't refetch on mount
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: false, // Don't retry failed requests
  });

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    if (!currentEvent) return;
    try {
      await logoutJury(currentEvent);
      setIsAuthenticated(false);

      // Clean up all Firestore listeners to prevent memory leaks
      cleanupAllListeners();

      // Clear React Query cache
      queryClient.clear();

      navigate({ to: "/" });
    } catch (error) {
      console.error("Error during logout:", error);
      // Still proceed with logout even if deactivation fails
      setIsAuthenticated(false);

      // Clean up resources even on error
      cleanupAllListeners();
      queryClient.clear();

      navigate({ to: "/" });
    }
  };

  return {
    isAuthenticated,
    juryId,
    juryMember,
    handleLoginSuccess,
    handleLogout,
  };
};
