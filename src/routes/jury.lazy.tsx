import { createLazyFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useActiveParticipant } from "../hooks/useActiveParticipant";
import { useJuryAuth } from "../hooks/useJuryAuth";
import { JuryLogin } from "@/components/ui/JuryLogin";
import { JuryHeader } from "../components/ui/JuryHeader";
import { JuryScoringPanel } from "@/components/ui/JuryScoringPanel";
import { EvaluationConfigGate } from "@/components/EvaluationConfigGate";
import { LiveUpdatesBanner } from "@/components/ui/LiveUpdatesBanner";
import { JuryQuranSheet } from "@/components/ui/JuryQuranSheet";

function RouteComponent() {
  const { t } = useTranslation();
  const { data: participant } = useActiveParticipant();

  const {
    isAuthenticated,
    isChecking,
    juryId,
    juryMember,
    handleLoginSuccess,
    handleLogout,
  } = useJuryAuth();

  if (isChecking) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center bg-muted/40 text-sm text-muted-foreground"
      >
        {t("jury.login.checking")}
      </div>
    );
  }

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
            <LiveUpdatesBanner />
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

      <JuryQuranSheet participant={participant || null} />
    </div>
  );
}

export const Route = createLazyFileRoute("/jury")({
  component: RouteComponent,
});
