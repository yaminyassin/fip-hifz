import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "@/main";
import { QuestionFields } from "@/models/models";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

// Define a type for scores that don't include overall_bonus
type QuestionOnlyFields = Omit<QuestionFields, "overall_bonus">;

// Define default scores for question-specific fields
const defaultQuestionScores: QuestionOnlyFields = {
  // Hifdh
  hifdh_judge_correction: 0,
  hifdh_self_correction: 0,
  hifdh_stuck_count: 0,
  // Tajweed
  tajweed_major: 0,
  tajweed_minor: 0,
  // Waqf & Ibtida
  waqf_ibtida_incorrect: 0,
  waqf_ibtida_meaning: 0,
  // Husn al-Ada
  husn_al_ada_score: 0,
};

interface Participant {
  id: string;
  name: string;
  age: number;
  category: string;
  assignedQuestions?: number[];
  isActive?: boolean;
}

interface UseJuryScoresProps {
  participant: Participant | null;
  juryId: string | null;
}

interface SaveScoresParams {
  questionNumToSave: number;
  scoresToSave: QuestionOnlyFields; // Remove overall_bonus from question scores
}

interface SaveOverallBonusParams {
  participantId: string;
  juryId: string;
  overallBonus: number;
}

export const useJuryScores = ({ participant, juryId }: UseJuryScoresProps) => {
  const [currentScores, setCurrentScores] = useState<QuestionOnlyFields>(
    defaultQuestionScores
  );
  const [allScores, setAllScores] = useState<{
    [questionNumber: number]: QuestionOnlyFields;
  }>({});
  const [overallBonus, setOverallBonus] = useState<number>(0);
  const [lastParticipantId, setLastParticipantId] = useState<string | null>(
    null
  );

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bonusDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousQuestionsRef = useRef<string>("");

  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Clear all previous scores for this participant and jury member
  const clearPreviousScores = useCallback(
    async (participantId: string, juryIdParam: string) => {
      try {
        const scoresRef = collection(firestore, "scores");
        const q = query(
          scoresRef,
          where("participantId", "==", participantId),
          where("juryId", "==", juryIdParam)
        );

        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        // Reset jury progress directly in the database
        const juryRef = doc(firestore, "jury", juryIdParam);
        await updateDoc(juryRef, {
          currentQuestion: 1,
          hasFinishedEvaluating: false,
        });

        queryClient.invalidateQueries({ queryKey: ["juryScores"] });
        // Removed invalidateQueries and refetchQueries for jury data since we use real-time updates

        console.log(
          `Cleared ${deletePromises.length} previous scores for participant ${participantId}`
        );
      } catch (error) {
        console.error("Error clearing previous scores:", error);
      }
    },
    [t, queryClient]
  );

  // Save scores mutation
  const saveScoresMutation = useMutation<void, Error, SaveScoresParams>({
    mutationFn: async ({ questionNumToSave, scoresToSave }) => {
      if (!participant?.id || !juryId) return;

      const pageNumber = participant.assignedQuestions?.[questionNumToSave - 1];
      if (!pageNumber) {
        throw new Error(`No page assigned for question ${questionNumToSave}`);
      }

      const scoreDoc = doc(
        firestore,
        "scores",
        `${participant.id}_${juryId}_${questionNumToSave}`
      );

      await setDoc(
        scoreDoc,
        {
          participantId: participant.id,
          juryId,
          questionNumber: questionNumToSave,
          pageNumber: pageNumber,
          scores: scoresToSave,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    },
    onSuccess: (_, variables) => {
      setAllScores((prev) => ({
        ...prev,
        [variables.questionNumToSave]: variables.scoresToSave,
      }));
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
    },
    onError: (error, variables) => {
      console.error(
        `Error saving scores for Q${variables.questionNumToSave}:`,
        error
      );
    },
  });

  // Mutation for saving overall bonus (participant-level)
  const saveOverallBonusMutation = useMutation<
    void,
    Error,
    SaveOverallBonusParams
  >({
    mutationFn: async ({ participantId, juryId, overallBonus }) => {
      const bonusDoc = doc(
        firestore,
        "overallBonuses",
        `${participantId}_${juryId}`
      );

      await setDoc(
        bonusDoc,
        {
          participantId,
          juryId,
          overallBonus,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
    },
    onError: (error) => {
      console.error("Error saving overall bonus:", error);
    },
  });

  // Handle score changes with debouncing
  const handleScoreChange = (
    receivedField: keyof QuestionFields,
    value: number,
    selectedQuestion: number
  ) => {
    // Since overall_bonus is no longer part of QuestionFields, we can directly cast
    const field = receivedField as keyof QuestionOnlyFields;

    let cappedValue = value;
    let newScores: QuestionOnlyFields | null = null;

    // Cap husn_al_ada_score between 0 and 10
    if (field === "husn_al_ada_score") {
      cappedValue = Math.min(10, Math.max(0, value));
    }

    setCurrentScores((prev) => {
      newScores = {
        ...prev,
        [field]: Math.max(0, cappedValue),
      };
      return newScores;
    });

    // Debounced save
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (newScores && juryId && participant?.id) {
        saveScoresMutation.mutate({
          questionNumToSave: selectedQuestion,
          scoresToSave: newScores,
        });
      }
    }, 500);
  };

  // Handle overall bonus changes with debouncing
  const handleOverallBonusChange = (value: number) => {
    const cappedValue = Math.min(5, Math.max(0, value));
    setOverallBonus(cappedValue);

    // Debounced save for overall bonus
    if (bonusDebounceTimeoutRef.current) {
      clearTimeout(bonusDebounceTimeoutRef.current);
    }

    bonusDebounceTimeoutRef.current = setTimeout(() => {
      if (juryId && participant?.id) {
        console.log("Saving overall bonus:", cappedValue);
        saveOverallBonusMutation.mutate({
          participantId: participant.id,
          juryId,
          overallBonus: cappedValue,
        });
      }
    }, 500);
  };

  // Reset scores when participant changes
  useEffect(() => {
    if (participant?.id && participant.id !== lastParticipantId) {
      console.log("Participant changed, resetting scores");
      setCurrentScores(defaultQuestionScores);
      setAllScores({});
      setOverallBonus(0);
      setLastParticipantId(participant.id);
    }
  }, [participant?.id, lastParticipantId]);

  // Fetch all scores for current participant
  useEffect(() => {
    const fetchAllScores = async () => {
      if (!participant?.id || !participant.assignedQuestions?.length || !juryId)
        return;

      try {
        // Fetch question scores
        const scoresRef = collection(firestore, "scores");
        const q = query(
          scoresRef,
          where("participantId", "==", participant.id),
          where("juryId", "==", juryId)
        );

        const snapshot = await getDocs(q);
        const scoresByQuestion: {
          [questionNumber: number]: QuestionOnlyFields;
        } = {};

        const currentPages = new Set(participant.assignedQuestions);

        snapshot.forEach((doc) => {
          const data = doc.data();
          const pageNumber = data.pageNumber;

          if (pageNumber === undefined || !currentPages.has(pageNumber)) {
            return;
          }

          const currentQuestionIndex =
            participant.assignedQuestions!.indexOf(pageNumber);
          if (currentQuestionIndex === -1) {
            return;
          }

          const currentQuestionNumber = currentQuestionIndex + 1;

          if (!scoresByQuestion[currentQuestionNumber]) {
            scoresByQuestion[currentQuestionNumber] = {
              ...defaultQuestionScores,
            };
          }

          const questionScoresFromDoc = data.scores as QuestionOnlyFields;

          Object.keys(questionScoresFromDoc).forEach((key) => {
            const fieldKey = key as keyof QuestionOnlyFields;
            const newValue = questionScoresFromDoc[fieldKey];
            scoresByQuestion[currentQuestionNumber][fieldKey] = newValue ?? 0;
          });
        });

        setAllScores(scoresByQuestion);

        // Fetch overall bonus separately
        const bonusSnapshot = await getDocs(
          query(
            collection(firestore, "overallBonuses"),
            where("participantId", "==", participant.id),
            where("juryId", "==", juryId)
          )
        );

        if (!bonusSnapshot.empty) {
          const bonusData = bonusSnapshot.docs[0].data();
          setOverallBonus(bonusData.overallBonus ?? 0);
        } else {
          setOverallBonus(0);
        }
      } catch (error) {
        console.error("Error fetching all scores:", error);
      }
    };

    fetchAllScores();
  }, [participant, juryId]);

  // Handle questions change detection
  const currentQuestionsKey = participant?.assignedQuestions?.join(",") || "";
  useEffect(() => {
    if (!participant?.id || !juryId) return;

    if (
      currentQuestionsKey &&
      previousQuestionsRef.current !== currentQuestionsKey &&
      previousQuestionsRef.current !== ""
    ) {
      console.log("Questions changed for participant, clearing old scores");
      setCurrentScores(defaultQuestionScores);
      setAllScores({});
      setOverallBonus(0);
      clearPreviousScores(participant.id, juryId);
    }

    previousQuestionsRef.current = currentQuestionsKey;
  }, [currentQuestionsKey, participant?.id, juryId, clearPreviousScores]);

  return {
    currentScores,
    allScores,
    overallBonus,
    setCurrentScores,
    setAllScores,
    handleScoreChange,
    handleOverallBonusChange,
    saveScoresMutation,
    saveOverallBonusMutation,
    clearPreviousScores,
    debounceTimeoutRef,
    bonusDebounceTimeoutRef,
    defaultQuestionScores,
  };
};
