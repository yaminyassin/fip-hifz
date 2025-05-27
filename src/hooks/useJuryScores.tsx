import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "../main";
import { useToast } from "../components/shadcn/use-toast";
import { QuestionFields } from "../models/models";

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
  const previousQuestionsRef = useRef<string>("");

  const { toast } = useToast();
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
        queryClient.invalidateQueries({ queryKey: ["jury", juryIdParam] });
        queryClient.refetchQueries({ queryKey: ["jury", juryIdParam] });

        console.log(
          `Cleared ${deletePromises.length} previous scores for participant ${participantId}`
        );
        toast({
          title: t("jury.messages.scoreReset"),
          description: t("jury.messages.scoreResetDesc"),
        });
      } catch (error) {
        console.error("Error clearing previous scores:", error);
      }
    },
    [t, queryClient, toast]
  );

  // Save scores mutation
  const saveScoresMutation = useMutation({
    mutationFn: async ({
      questionNumToSave,
      scoresToSave,
    }: {
      questionNumToSave: number;
      scoresToSave: QuestionFields;
    }) => {
      if (!juryId || !participant) return;

      const pageNumber = participant.assignedQuestions?.[questionNumToSave - 1];
      if (pageNumber === undefined) {
        throw new Error(
          `Page number not found for question ${questionNumToSave}`
        );
      }

      const scoreRef = doc(
        firestore,
        "scores",
        `${participant.id}_${juryId}_q${questionNumToSave}_p${pageNumber}`
      );

      await setDoc(
        scoreRef,
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { overall_bonus, ...questionOnlyScores } = variables.scoresToSave;
      setAllScores((prev) => ({
        ...prev,
        [variables.questionNumToSave]: questionOnlyScores,
      }));
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
      queryClient.invalidateQueries({ queryKey: ["jury", juryId] });
    },
    onError: (error, variables) => {
      console.error(
        `Error saving scores for Q${variables.questionNumToSave}:`,
        error
      );
      toast({
        title: t("common.error"),
        description: t("jury.messages.errorSavingScores"),
        variant: "destructive",
      });
    },
  });

  // Handle score changes with debouncing
  const handleScoreChange = (
    receivedField: keyof QuestionFields,
    value: number,
    selectedQuestion: number
  ) => {
    if (receivedField === "overall_bonus") {
      return;
    }
    const field = receivedField as keyof QuestionOnlyFields;

    let cappedValue = value;
    let newScores: QuestionOnlyFields | null = null;

    // Cap husn_al_ada_score between 0 and 10
    if (field === "husn_al_ada_score") {
      cappedValue = Math.min(10, Math.max(0, value));
      if (value > 10 || value < 0) {
        toast({
          title: t("jury.messages.scoreCappedTitle"),
          description: t("jury.messages.scoreCappedDesc", {
            field: t("jury.categories.husn_al_ada_score"),
            min: 0,
            max: 10,
            value: cappedValue,
          }),
        });
      }
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
        const scoresToSaveForQuestion: QuestionFields = {
          ...newScores,
          overall_bonus: overallBonus,
        };
        saveScoresMutation.mutate({
          questionNumToSave: selectedQuestion,
          scoresToSave: scoresToSaveForQuestion,
        });
      }
    }, 500);
  };

  // Handle overall bonus changes
  const handleOverallBonusChange = (value: number) => {
    const cappedValue = Math.min(3, Math.max(0, value));
    if (value > 3 || value < 0) {
      toast({
        title: t("jury.messages.scoreCappedTitle"),
        description: t("jury.messages.scoreCappedDesc", {
          field: t("jury.categories.overall_bonus"),
          min: 0,
          max: 3,
          value: cappedValue,
        }),
      });
    }
    setOverallBonus(cappedValue);
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
        let initialOverallBonus: number | undefined = undefined;

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

          const allFieldsFromDoc = data.scores as QuestionFields;
          const { overall_bonus: bonusFromDoc, ...questionOnlyScoresFromDoc } =
            allFieldsFromDoc;

          Object.keys(questionOnlyScoresFromDoc).forEach((key) => {
            const fieldKey = key as keyof QuestionOnlyFields;
            const newValue = questionOnlyScoresFromDoc[fieldKey];
            scoresByQuestion[currentQuestionNumber][fieldKey] = newValue ?? 0;
          });

          if (
            initialOverallBonus === undefined &&
            currentQuestionNumber === 1 &&
            bonusFromDoc !== undefined
          ) {
            initialOverallBonus = bonusFromDoc;
          }
        });

        setAllScores(scoresByQuestion);
        setOverallBonus(initialOverallBonus ?? 0);
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
    clearPreviousScores,
    debounceTimeoutRef,
    defaultQuestionScores,
  };
};
