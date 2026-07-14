import { createLazyFileRoute } from "@tanstack/react-router";

import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { useJuryAuth } from "../hooks/useJuryAuth";
import { JuryLogin } from "@/components/ui/JuryLogin";
import { JuryHeader } from "../components/ui/JuryHeader";
import { JuryScoringPanel } from "@/components/ui/JuryScoringPanel";
import { EvaluationConfigGate } from "@/components/EvaluationConfigGate";

function RouteComponent() {
  const { data: participant } = useActiveParticipant();

  const {
    isAuthenticated,
    juryId,
    juryMember,
    handleLoginSuccess,
    handleLogout,
  } = useJuryAuth();

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
            {/* The scoring hooks live inside JuryScoringPanel so they only
                mount under a `ready` config, never against a loading or
                fail-closed one. */}
            <EvaluationConfigGate>
              <JuryScoringPanel
                participant={participant || null}
                juryMember={juryMember || null}
                juryId={juryId}
              />
            </EvaluationConfigGate>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});
