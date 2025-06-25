import { createLazyFileRoute } from "@tanstack/react-router";

import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { useJuryAuth } from "../hooks/useJuryAuth";
import { useJuryScores } from "../hooks/useJuryScores.tsx";
import { useJuryNavigation } from "../hooks/useJuryNavigation";
import { JuryLogin } from "@/components/ui/JuryLogin";
import { JuryHeader } from "../components/ui/JuryHeader";
import { ScoreForm } from "../components/ui/ScoreForm";

// This component has been moved to ../components/ui/ScoreCategory.tsx

function RouteComponent() {
  const { data: participant } = useActiveParticipant();

  // Use custom hooks for modular functionality
  const {
    isAuthenticated,
    juryId,
    juryMember,
    handleLoginSuccess,
    handleLogout,
  } = useJuryAuth();

  const {
    currentScores,
    allScores,
    overallBonus,
    pendingSave,
    setCurrentScores,
    handleScoreChange,
    handleOverallBonusChange,
    saveScoresMutation,
    debounceTimeoutRef,
    defaultQuestionScores,
  } = useJuryScores({ participant: participant || null, juryId });

  const { 
    selectedQuestion, 
    questionChangedExternally, 
    isViewingActiveQuestion,
    activeQuestionNumber,
    handleQuestionChange, 
    handleDone,
    handleGoToActiveQuestion,
  } = useJuryNavigation({
      participant: participant || null,
      juryMember: juryMember || null,
      juryId,
      debounceTimeoutRef,
      saveScoresMutation,
      currentScores,
      overallBonus,
    });

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <JuryLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-400">
      <JuryHeader
        participant={participant || null}
        juryMember={juryMember || null}
        onLogout={handleLogout}
      />

      <div className="flex flex-row px-4 flex-grow">
        <div className="flex flex-col w-full">
          <div className="p-4 space-y-4 flex-grow">
            <ScoreForm
              participant={participant || null}
              juryMember={juryMember || null}
              selectedQuestion={selectedQuestion}
              questionChangedExternally={questionChangedExternally}
              isViewingActiveQuestion={isViewingActiveQuestion}
              activeQuestionNumber={activeQuestionNumber}
              currentScores={currentScores}
              overallBonus={overallBonus}
              allScores={allScores}
              pendingSave={pendingSave}
              onScoreChange={handleScoreChange}
              onOverallBonusChange={handleOverallBonusChange}
              onQuestionChange={handleQuestionChange}
              onDone={handleDone}
              onGoToActiveQuestion={handleGoToActiveQuestion}
              isSaving={saveScoresMutation.isPending}
              setCurrentScores={setCurrentScores}
              defaultQuestionScores={defaultQuestionScores}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});
