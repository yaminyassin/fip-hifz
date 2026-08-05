import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, updateDoc, doc, where } from "firebase/firestore";
import { firestore } from "@/main";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { dismissNotification, notifyError, NOTIFY_KEYS } from "@/lib/notify";
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

/** A write that did not reach Firestore. `questionNumber` is null for the
 * participant-level adjustment write, which is not tied to one question. */
export interface JuryScoreSaveError {
  questionNumber: number | null;
  message: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useJuryScores = ({ participant, juryId }: UseJuryScoresProps) => {
  const { currentEvent, evaluationConfig } = useEvent();
  const { t } = useTranslation();

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

  // Error surfaces (design doc §9). A juror is looking at the form, so both
  // of these are rendered in place by ScoreForm as well as being notified.
  const [saveError, setSaveError] = useState<JuryScoreSaveError | null>(null);
  const [scoresLoadError, setScoresLoadError] = useState<string | null>(null);
  const [adjustmentsLoadError, setAdjustmentsLoadError] = useState<string | null>(null);
  // Bumped by `retryLoad` to re-run both fetch effects.
  const [loadAttempt, setLoadAttempt] = useState(0);

  /**
   * A read failure is more dangerous than a write failure here: when the
   * stored scores never arrive, `allScores` stays empty, ScoreForm's reset
   * effect fills the inputs with the config defaults (zeros), and the first
   * slider a juror touches writes that whole zeroed map over the scores that
   * ARE persisted. So a load failure must disable the inputs, not just warn.
   */
  const loadError = scoresLoadError ?? adjustmentsLoadError;

  const retryLoad = useCallback(() => {
    setScoresLoadError(null);
    setAdjustmentsLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const dismissSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  // The persistent toast and the in-place banner must never disagree about
  // whether a write is still outstanding, so the toast is tied to the state
  // rather than dismissed at each individual call site: a save that resolves
  // one failure while another is still live leaves both surfaces up.
  useEffect(() => {
    if (saveError === null) dismissNotification(NOTIFY_KEYS.juryScoreSave);
  }, [saveError]);

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
        // A failed clear leaves scores keyed to the OLD assignment behind, so
        // the juror must know their re-scoring is starting from a dirty slate.
        console.error("Error clearing previous scores:", error);
        notifyError({
          key: NOTIFY_KEYS.juryScoreSave,
          title: t("jury.messages.clearFailedTitle"),
          description: t("jury.messages.clearFailedDesc", { reason: errorMessage(error) }),
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Only THIS question's failure is resolved. Clearing unconditionally
      // would erase a still-unpersisted failure for a different write — Q1's
      // "not saved" banner vanishing because Q2 saved, or the participant-level
      // adjustment failure vanishing because any question saved. The keyed
      // toast is dismissed by the effect below, once `saveError` is really null.
      setSaveError((current) =>
        current?.questionNumber === variables.questionNumToSave ? null : current
      );
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
    },
    onError: (error, variables) => {
      console.error(`Error saving scores for Q${variables.questionNumToSave}:`, error);
      setPendingSave(false);
      const message = errorMessage(error);
      setSaveError({ questionNumber: variables.questionNumToSave, message });
      notifyError({
        key: NOTIFY_KEYS.juryScoreSave,
        title: t("jury.messages.saveFailedTitle"),
        description: t("jury.messages.saveFailedDesc", {
          number: variables.questionNumToSave,
          reason: message,
        }),
      });
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
      setSaveError((current) => (current?.questionNumber === null ? null : current));
      queryClient.invalidateQueries({ queryKey: ["juryScores"] });
    },
    onError: (error) => {
      console.error("Error saving jury evaluation inputs:", error);
      setPendingAdjustmentSave(false);
      const message = errorMessage(error);
      setSaveError({ questionNumber: null, message });
      notifyError({
        key: NOTIFY_KEYS.juryScoreSave,
        title: t("jury.messages.saveFailedTitle"),
        description: t("jury.messages.adjustmentSaveFailedDesc", { reason: message }),
      });
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
      setSaveError(null);
      setScoresLoadError(null);
      setAdjustmentsLoadError(null);
      dismissNotification(NOTIFY_KEYS.juryScoreSave);
      dismissNotification(NOTIFY_KEYS.juryScoreLoad);
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
        setScoresLoadError(null);
        dismissNotification(NOTIFY_KEYS.juryScoreLoad);
      } catch (error) {
        console.error("Error fetching all scores:", error);
        setScoresLoadError(errorMessage(error));
        notifyError({
          key: NOTIFY_KEYS.juryScoreLoad,
          title: t("jury.messages.loadFailedTitle"),
          description: t("jury.messages.loadFailedDesc"),
        });
      }
    };

    fetchAllScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant, juryId, currentEvent, evaluationConfig, loadAttempt]);

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
        setAdjustmentsLoadError(null);
      } catch (error) {
        // Same hazard as the score read: falling back to the defaults here
        // silently zeroes a bonus the jury already awarded, and the next
        // adjustment write would persist that zero.
        console.error("Error fetching jury evaluation inputs:", error);
        setAdjustmentValues(defaultAdjustmentValues);
        setAdjustmentsLoadError(errorMessage(error));
        notifyError({
          key: NOTIFY_KEYS.juryScoreLoad,
          title: t("jury.messages.loadFailedTitle"),
          description: t("jury.messages.loadFailedDesc"),
        });
      }
    };

    fetchAdjustmentValues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant?.id, juryId, pendingAdjustmentSave, currentEvent, evaluationConfig, loadAttempt]);

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
    saveError,
    loadError,
    retryLoad,
    dismissSaveError,
    saveScoresMutation,
    saveAdjustmentMutation,
    clearPreviousScores,
    debounceTimeoutRef,
    adjustmentDebounceTimeoutRef,
    defaultQuestionValues,
    defaultAdjustmentValues,
  };
};
