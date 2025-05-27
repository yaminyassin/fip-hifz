import { createLazyFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { useJuryAuth } from "../hooks/useJuryAuth";
import { useJuryScores } from "../hooks/useJuryScores.tsx";
import { useJuryNavigation } from "../hooks/useJuryNavigation";
import { JuryLogin } from "@/components/ui/JuryLogin";
import { JuryHeader } from "../components/ui/JuryHeader";
import { ScoreForm } from "../components/ui/ScoreForm";
import { JuryBottomNav } from "../components/ui/JuryBottomNav";

// This component has been moved to ../components/ui/ScoreCategory.tsx

function RouteComponent() {
  const { t } = useTranslation();
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
    setCurrentScores,
    handleScoreChange,
    handleOverallBonusChange,
    saveScoresMutation,
    debounceTimeoutRef,
    defaultQuestionScores,
  } = useJuryScores({ participant: participant || null, juryId });

  const { selectedQuestion, handleQuestionChange, handleDone } =
    useJuryNavigation({
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
              currentScores={currentScores}
              overallBonus={overallBonus}
              allScores={allScores}
              onScoreChange={handleScoreChange}
              onOverallBonusChange={handleOverallBonusChange}
              setCurrentScores={setCurrentScores}
              defaultQuestionScores={defaultQuestionScores}
            />

            <JuryBottomNav
              participant={participant}
              selectedQuestion={selectedQuestion}
              juryMember={juryMember}
              handleQuestionChange={handleQuestionChange}
              handleDone={handleDone}
              isSaving={saveScoresMutation.isPending}
              t={t}
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
