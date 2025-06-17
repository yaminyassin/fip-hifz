import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/main";
import {
  getAuthenticatedJury,
  clearAuthenticatedJury,
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
  });

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    clearAuthenticatedJury();
    setIsAuthenticated(false);
    queryClient.clear();
    navigate({ to: "/" });
  };

  return {
    isAuthenticated,
    juryId,
    juryMember,
    handleLoginSuccess,
    handleLogout,
  };
};
