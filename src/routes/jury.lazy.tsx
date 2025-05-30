import { createLazyFileRoute } from "@tanstack/react-router";

import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { useJuryAuth } from "../hooks/useJuryAuth";
import { useJuryScores } from "../hooks/useJuryScores.tsx";
import { useJuryNavigation } from "../hooks/useJuryNavigation";
import { JuryLogin } from "@/components/ui/JuryLogin";
import { JuryHeader } from "../components/ui/JuryHeader";
import { ScoreForm } from "../components/ui/ScoreForm";
import { Button } from "@/components/shadcn/button";
import { useTranslation } from "react-i18next";

// This component has been moved to ../components/ui/ScoreCategory.tsx

function RouteComponent() {
  const { data: participant } = useActiveParticipant();
  const { t } = useTranslation();

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

  // Check if jury member is active
  if (juryMember && !juryMember.isActive) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-400">
        <JuryHeader
          participant={participant || null}
          juryMember={juryMember || null}
          onLogout={handleLogout}
        />
        <div className="flex flex-col items-center justify-center flex-grow">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              {t("jury.messages.inactiveTitle")}
            </h2>
            <p className="text-gray-600 mb-6">
              {t("jury.messages.inactiveDesc")}
            </p>
            <Button onClick={handleLogout} variant="outline">
              {t("jury.actions.logout")}
            </Button>
          </div>
        </div>
      </div>
    );
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
              onQuestionChange={handleQuestionChange}
              onDone={handleDone}
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
