import { useState } from "react";
import { Card } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";

import { authenticateJury, setAuthenticatedJury } from "@/services/juryAuth";
import { useEvent } from "@/contexts/EventContext";
import { useTranslation } from "react-i18next";

interface JuryLoginProps {
  onLoginSuccess: () => void;
}

export const JuryLogin = ({ onLoginSuccess }: JuryLoginProps) => {
  const [juryId, setJuryId] = useState("");
  const { t } = useTranslation();
  const { currentEvent } = useEvent();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);

    try {
      const isAuthenticated = await authenticateJury(currentEvent || 'demo-2026', juryId);
      if (isAuthenticated) {
        setAuthenticatedJury(juryId);
        onLoginSuccess();
      } else {
        setError(t("jury.login.invalidId", "Invalid jury ID"));
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      setError(t("jury.login.error", "Login failed. Please try again."));
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md p-6 space-y-6 bg-card/50 backdrop-blur-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">{t("jury.login.title")}</h1>
          <p className="text-muted-foreground">{t("jury.login.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="text"
              placeholder={t("jury.login.placeholder")}
              value={juryId}
              onChange={(e) => setJuryId(e.target.value)}
              disabled={isLoggingIn}
            />
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!juryId.trim() || isLoggingIn}
          >
            {isLoggingIn
              ? t("jury.login.loggingIn", "Logging in...")
              : t("jury.login.button")
            }
          </Button>
        </form>
      </Card>
    </div>
  );
};
