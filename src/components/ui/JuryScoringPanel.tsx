import { useJuryScores } from "@/hooks/useJuryScores.tsx";
import { useJuryNavigation } from "@/hooks/useJuryNavigation";
import { ScoreForm } from "@/components/ui/ScoreForm";
import type { Jury, Participant } from "@/models/models";

interface JuryScoringPanelProps {
  participant: Participant | null;
  juryMember: Jury | null;
  juryId: string | null;
}

/**
 * The authenticated jury scoring surface. It owns `useJuryScores` and
 * `useJuryNavigation` so those hooks — which read/write the V2
 * `evaluationScores` / `juryEvaluationInputs` collections and build state from
 * the event's `evaluationConfig` — only mount when the config is `ready`. This
 * component is rendered strictly inside `<EvaluationConfigGate>`; the gate
 * guarantees `evaluationConfig` is non-null before any scoring hook runs, so
 * scores can never be entered against a loading, missing, or fail-closed
 * config.
 */
export function JuryScoringPanel({ participant, juryMember, juryId }: JuryScoringPanelProps) {
  const {
    currentScores,
    allScores,
    adjustmentValues,
    pendingSave,
    setCurrentScores,
    handleScoreChange,
    handleAdjustmentChange,
    saveError,
    loadError,
    retryLoad,
    dismissSaveError,
    saveScoresMutation,
    saveAdjustmentMutation,
    debounceTimeoutRef,
    defaultQuestionValues,
  } = useJuryScores({ participant, juryId });

  const {
    selectedQuestion,
    questionChangedExternally,
    isViewingActiveQuestion,
    activeQuestionNumber,
    handleQuestionChange,
    handleDone,
    handleGoToActiveQuestion,
    finishError,
    dismissFinishError,
  } = useJuryNavigation({
    participant,
    juryMember,
    juryId,
    debounceTimeoutRef,
    saveScoresMutation,
    saveAdjustmentMutation,
    currentScores,
    adjustmentValues,
    allScores,
    loadError,
  });

  return (
    <ScoreForm
      participant={participant}
      juryMember={juryMember}
      selectedQuestion={selectedQuestion}
      questionChangedExternally={questionChangedExternally}
      isViewingActiveQuestion={isViewingActiveQuestion}
      activeQuestionNumber={activeQuestionNumber}
      currentScores={currentScores}
      adjustmentValues={adjustmentValues}
      allScores={allScores}
      pendingSave={pendingSave}
      onScoreChange={handleScoreChange}
      onAdjustmentChange={handleAdjustmentChange}
      onQuestionChange={handleQuestionChange}
      onDone={handleDone}
      onGoToActiveQuestion={handleGoToActiveQuestion}
      isSaving={saveScoresMutation.isPending}
      setCurrentScores={setCurrentScores}
      defaultQuestionValues={defaultQuestionValues}
      saveError={saveError}
      loadError={loadError}
      finishError={finishError}
      onRetryLoad={retryLoad}
      onDismissSaveError={dismissSaveError}
      onDismissFinishError={dismissFinishError}
    />
  );
}
