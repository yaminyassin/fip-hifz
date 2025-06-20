import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import {
  getAuthenticatedJury,
  logoutJury,
} from "../services/juryAuth";
import { Jury } from "../models/models";

export const useJuryAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Check authentication on mount
  useEffect(() => {
    const juryId = getAuthenticatedJury();
    setIsAuthenticated(!!juryId);
  }, []);

  // Handle browser close/refresh to deactivate jury member
  useEffect(() => {
    const handleBeforeUnload = () => {
      const juryId = getAuthenticatedJury();
      if (juryId) {
        // Use sendBeacon for reliable request during page unload
        const data = JSON.stringify({
          juryId,
          action: 'deactivate'
        });

        // Try to send a beacon request to deactivate the jury
        // Note: This would require a server endpoint, so for now we'll use the simple approach
        // and accept that some cases might not deactivate properly
        try {
          // For immediate deactivation, we'll trigger the logout
          // This might not always complete but it's better than nothing
          logoutJury().catch(console.error);
        } catch (error) {
          console.error("Error deactivating jury on page unload:", error);
        }
      }
    };

    // Handle browser close/refresh
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const juryId = getAuthenticatedJury();

  // Set up real-time listener for jury member data
  useEffect(() => {
    if (!juryId) return;

    const juryRef = doc(firestore, "jury", juryId);

    const unsubscribe = onSnapshot(
      juryRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const juryMember = {
            id: docSnapshot.id,
            ...docSnapshot.data(),
          } as Jury;
          queryClient.setQueryData(["jury", juryId], juryMember);
        } else {
          queryClient.setQueryData(["jury", juryId], null);
        }
      },
      (error) => {
        console.error("Error fetching jury member:", error);
      }
    );

    return () => unsubscribe();
  }, [juryId, queryClient]);

  const { data: juryMember } = useQuery<Jury | null>({
    queryKey: ["jury", juryId],
    queryFn: () => null, // Initial value, will be updated by the listener
    enabled: !!juryId,
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
    try {
      await logoutJury();
      setIsAuthenticated(false);
      queryClient.clear();
      navigate({ to: "/" });
    } catch (error) {
      console.error("Error during logout:", error);
      // Still proceed with logout even if deactivation fails
      setIsAuthenticated(false);
      queryClient.clear();
      navigate({ to: "/" });
    }
  };
  console.log("juryMember", juryMember);
  return {
    isAuthenticated,
    juryId,
    juryMember,
    handleLoginSuccess,
    handleLogout,
  };
};
