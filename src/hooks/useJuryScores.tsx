import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, updateDoc, doc, where } from "firebase/firestore";
import { firestore } from "@/main";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEvent } from "@/contexts/EventContext";
import { getEventCollectionPath } from "@/utils/firebaseUtils";
import {
  buildDefaultAdjustmentValues,
  buildDefaultQuestionValues,
  mergeAdjustmentValues,
  mergeQuestionValues,
} from "@/evaluation/configHelpers";
import type { AdjustmentValueMap, QuestionValueMap } from "@/evaluation/scoringEngine";
import {
  clearEvaluationScores,
  EVALUATION_SCORES_COLLECTION,
  JURY_EVALUATION_INPUTS_COLLECTION,
  saveEvaluationScore,
  saveJuryEvaluationInputs,
} from "@/services/evaluationScores";

/**
 * Config-driven jury scoring state (design doc §4, "Consumer wiring"):
 * `currentScores`/`allScores` are `QuestionValueMap`s keyed by the event's
 * `questionTypes` and their `inputs`, and `adjustmentValues` is an
 * `AdjustmentValueMap` keyed by `participantAdjustments` — never a
 * hardcoded hifdh/tajweed/bonus shape. Writes go to the V2
 * `evaluationScores` / `juryEvaluationInputs` collections via
 * src/services/evaluationScores.ts, which validates against the engine
 * before persisting. Only meaningful once `evaluationConfig` is `ready`
 * (the caller renders this behind `<EvaluationConfigGate>`).
 */

interface Participant {
  id: string;
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
  scoresToSave: QuestionValueMap;
}

export const useJuryScores = ({ participant, juryId }: UseJuryScoresProps) => {
  const { currentEvent, evaluationConfig } = useEvent();

  const defaultQuestionValues = evaluationConfig
    ? buildDefaultQuestionValues(evaluationConfig)
    : ({} as QuestionValueMap);
  const defaultAdjustmentValues = evaluationConfig
    ? buildDefaultAdjustmentValues(evaluationConfig)
    : ({} as AdjustmentValueMap);

  const [currentScores, setCurrentScores] = useState<QuestionValueMap>(defaultQuestionValues);
  const [allScores, setAllScores] = useState<Record<number, QuestionValueMap>>({});
  const [adjustmentValues, setAdjustmentValues] = useState<AdjustmentValueMap>(
    defaultAdjustmentValues
  );
  const [lastParticipantId, setLastParticipantId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [pendingAdjustmentSave, setPendingAdjustmentSave] = useState(false);

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adjustmentDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousQuestionsRef = useRef<string>("");

  const queryClient = useQueryClient();

  const clearPreviousScores = useCallback(
    async (participantId: string, juryIdParam: string) => {
      if (!currentEvent) return;
      try {
        await clearEvaluationScores(currentEvent, participantId, juryIdParam);

        const juryCollection = collection(firestore, getEventCollectionPath(currentEvent, "jury"));
        await updateDoc(doc(juryCollection, juryIdParam), {
          currentQuestion: 1,
          hasFinishedEvaluating: false,
        });

        queryClient.invalidateQueries({ queryKey: ["juryScores"] });
      } catch (error) {
        console.error("Error clearing previous scores:", error);
      }
    },
    [queryClient, currentEvent]
  );

  const saveScoresMutation = useMutation<void, Error, SaveScoresParams>({
    mutationFn: async ({ questionNumToSave, scoresToSave }) => {
      if (!participant?.id || !juryId || !currentEvent || !evaluationConfig) return;

      const pageNumber = participant.assignedQuestions?.[questionNumToSave - 1];
      if (!pageNumber) {
        throw new Error(`No page assigned for question ${questionNumToSave}`);
      }

      await saveEvaluationScore({
        eventId: currentEvent,
        participantId: participant.id,
        juryId,
        questionNumber: questionNumToSave,
        pageNumber,
        categoryId: participant.category,
        config: evaluationConfig,
        values: scoresToSave,
        assignedQuestions: participant.assignedQuestions ?? [],
      });
    },
    onSuccess: (_, variables) => {
      setAllScores((prev) => ({
        ...prev,
        [variables.questionNumToSave]: variables.scoresToSave,
      }));
      setPendingSave(false);
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
    },
    onError: (error, variables) => {
      console.error(`Error saving scores for Q${variables.questionNumToSave}:`, error);
      setPendingSave(false);
    },
  });

  const saveAdjustmentMutation = useMutation<void, Error, AdjustmentValueMap>({
    mutationFn: async (values) => {
      if (!currentEvent || !participant?.id || !juryId || !evaluationConfig) return;
      await saveJuryEvaluationInputs({
        eventId: currentEvent,
        participantId: participant.id,
        juryId,
        categoryId: participant.category,
        config: evaluationConfig,
        values,
        assignedQuestions: participant.assignedQuestions ?? [],
      });
    },
    onSuccess: () => {
      setPendingAdjustmentSave(false);
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
    },
    onError: (error) => {
      console.error("Error saving jury evaluation inputs:", error);
      setPendingAdjustmentSave(false);
    },
  });

  const handleScoreChange = useCallback(
    (questionTypeId: string, inputId: string, value: number, selectedQuestion: number) => {
      setPendingSave(true);

      let newScores: QuestionValueMap | null = null;
      setCurrentScores((prev) => {
        newScores = {
          ...prev,
          [questionTypeId]: {
            ...prev[questionTypeId],
            [inputId]: Math.max(0, value),
          },
        };
        return newScores;
      });

      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        if (newScores && juryId && participant?.id) {
          saveScoresMutation.mutate({
            questionNumToSave: selectedQuestion,
            scoresToSave: newScores,
          });
        } else {
          setPendingSave(false);
        }
      }, 500);
    },
    [juryId, participant?.id, saveScoresMutation]
  );

  const handleAdjustmentChange = useCallback(
    (adjustmentId: string, inputId: string, value: number) => {
      setPendingAdjustmentSave(true);

      let newValues: AdjustmentValueMap | null = null;
      setAdjustmentValues((prev) => {
        newValues = {
          ...prev,
          [adjustmentId]: {
            ...prev[adjustmentId],
            [inputId]: Math.max(0, value),
          },
        };
        return newValues;
      });

      if (adjustmentDebounceTimeoutRef.current) clearTimeout(adjustmentDebounceTimeoutRef.current);
      adjustmentDebounceTimeoutRef.current = setTimeout(() => {
        if (newValues && juryId && participant?.id) {
          saveAdjustmentMutation.mutate(newValues);
        } else {
          setPendingAdjustmentSave(false);
        }
      }, 500);
    },
    [juryId, participant?.id, saveAdjustmentMutation]
  );

  // NOTE: intentionally no debounce-cancel on unmount. A pending 500ms save
  // timer fires post-unmount and its Firestore write still completes (only the
  // onSuccess setState is a harmless no-op), so a juror's last edit persists
  // even if they log out or leave /jury immediately after typing. Cancelling
  // here would silently drop that last edit. Genuinely stale writes (question
  // / participant / event changes) are already prevented by the navigation
  // flush in useJuryNavigation and the reset effects below.

  // Reset scores when participant changes.
  useEffect(() => {
    if (participant?.id && participant.id !== lastParticipantId) {
      setCurrentScores(defaultQuestionValues);
      setAllScores({});
      setAdjustmentValues(defaultAdjustmentValues);
      setPendingSave(false);
      setPendingAdjustmentSave(false);
      setLastParticipantId(participant.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant?.id, lastParticipantId]);

  // Fetch all stored question scores for the current participant/jury.
  useEffect(() => {
    const fetchAllScores = async () => {
      if (
        !participant?.id ||
        !participant.assignedQuestions?.length ||
        !juryId ||
        !currentEvent ||
        !evaluationConfig
      )
        return;

      try {
        const scoresRef = collection(
          firestore,
          getEventCollectionPath(currentEvent, EVALUATION_SCORES_COLLECTION)
        );
        const snapshot = await getDocs(
          query(scoresRef, where("participantId", "==", participant.id), where("juryId", "==", juryId))
        );

        const scoresByQuestion: Record<number, QuestionValueMap> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const questionNumber = data.questionNumber as number;
          if (typeof questionNumber !== "number") return;
          scoresByQuestion[questionNumber] = mergeQuestionValues(
            evaluationConfig,
            data.values as QuestionValueMap
          );
        });

        setAllScores(scoresByQuestion);
      } catch (error) {
        console.error("Error fetching all scores:", error);
      }
    };

    fetchAllScores();
  }, [participant, juryId, currentEvent, evaluationConfig]);

  // Fetch the jury's participant-level adjustment values.
  useEffect(() => {
    const fetchAdjustmentValues = async () => {
      if (!participant?.id || !juryId || !currentEvent || !evaluationConfig) {
        setAdjustmentValues(defaultAdjustmentValues);
        return;
      }
      if (pendingAdjustmentSave) return;

      try {
        const inputsRef = collection(
          firestore,
          getEventCollectionPath(currentEvent, JURY_EVALUATION_INPUTS_COLLECTION)
        );
        const snapshot = await getDocs(
          query(inputsRef, where("participantId", "==", participant.id), where("juryId", "==", juryId))
        );

        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setAdjustmentValues(
            mergeAdjustmentValues(evaluationConfig, data.values as AdjustmentValueMap)
          );
        } else {
          setAdjustmentValues(defaultAdjustmentValues);
        }
      } catch (error) {
        console.error("Error fetching jury evaluation inputs:", error);
        setAdjustmentValues(defaultAdjustmentValues);
      }
    };

    fetchAdjustmentValues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant?.id, juryId, pendingAdjustmentSave, currentEvent, evaluationConfig]);

  // Reset in-progress state when the participant's assigned questions
  // change (a reassignment) — never keep stale scores for a new set of
  // pages.
  const currentQuestionsKey = participant?.assignedQuestions?.join(",") || "";
  useEffect(() => {
    if (!participant?.id || !juryId) return;

    if (
      currentQuestionsKey &&
      previousQuestionsRef.current !== currentQuestionsKey &&
      previousQuestionsRef.current !== ""
    ) {
      setCurrentScores(defaultQuestionValues);
      setAllScores({});
      setAdjustmentValues(defaultAdjustmentValues);
      setPendingSave(false);
      setPendingAdjustmentSave(false);
      clearPreviousScores(participant.id, juryId);
    }

    previousQuestionsRef.current = currentQuestionsKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionsKey, participant?.id, juryId, clearPreviousScores]);

  return {
    currentScores,
    allScores,
    adjustmentValues,
    pendingSave,
    pendingAdjustmentSave,
    setCurrentScores,
    setAllScores,
    handleScoreChange,
    handleAdjustmentChange,
    saveScoresMutation,
    saveAdjustmentMutation,
    clearPreviousScores,
    debounceTimeoutRef,
    adjustmentDebounceTimeoutRef,
    defaultQuestionValues,
    defaultAdjustmentValues,
  };
};
