import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { useEvent } from "@/contexts/EventContext";
import { useJuryMembers } from "@/hooks/useJuryMembers";
import type { Jury } from "@/models/models";
import {
  authenticateJury,
  setAuthenticatedJury,
} from "@/services/juryAuth";

interface JuryLoginProps {
  onLoginSuccess: (jury: Jury) => void;
}

type LoginStep =
  | { kind: "search" }
  | { kind: "confirm"; jury: Jury };

export const JuryLogin = ({ onLoginSuccess }: JuryLoginProps) => {
  const { t } = useTranslation();
  const { currentEvent } = useEvent();
  const { data: juryMembers = [], isLoading } = useJuryMembers();
  const [searchQuery, setSearchQuery] = useState("");
  const [step, setStep] = useState<LoginStep>({ kind: "search" });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredJuryMembers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return [...juryMembers]
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((jury) =>
        jury.name.toLocaleLowerCase().includes(normalizedQuery)
      );
  }, [juryMembers, searchQuery]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setStep({ kind: "search" });
    setError(null);
  };

  const handleSelect = (jury: Jury) => {
    setStep({ kind: "confirm", jury });
    setError(null);
  };

  const handleConfirm = async () => {
    if (!currentEvent || step.kind !== "confirm") return;

    setIsLoggingIn(true);
    setError(null);

    try {
      const authenticatedJury = await authenticateJury(
        currentEvent,
        step.jury.id
      );
      if (!authenticatedJury) {
        setError(t("jury.login.error.invalidDesc"));
        return;
      }

      setAuthenticatedJury(currentEvent, authenticatedJury.id);
      onLoginSuccess(authenticatedJury);
    } catch (loginError) {
      console.error("Authentication failed:", loginError);
      setError(t("jury.login.error.failedDesc"));
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 p-4 sm:p-8">
      <section className="mx-auto w-full max-w-xl border border-border bg-background shadow-sm">
        <header className="flex items-center justify-between border-b-4 border-primary px-5 py-4 sm:px-6">
          <span className="font-semibold uppercase tracking-wide text-primary">
            {t("jury.login.station")}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("jury.login.event")}
          </span>
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {t("jury.login.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("jury.login.subtitle")}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="jury-search" className="text-sm font-semibold">
              {t("jury.login.searchLabel")}
            </label>
            <Input
              id="jury-search"
              type="search"
              autoComplete="off"
              placeholder={t("jury.login.placeholder")}
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              disabled={isLoggingIn}
              className="h-12 rounded-none border-2"
            />
          </div>

          <div
            className="divide-y border border-border"
            aria-live="polite"
            aria-busy={isLoading}
          >
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("jury.login.loading")}
              </p>
            ) : filteredJuryMembers.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {juryMembers.length === 0
                  ? t("jury.login.empty")
                  : t("jury.login.noMatches")}
              </p>
            ) : (
              filteredJuryMembers.map((jury) => (
                <div
                  key={jury.id}
                  className="flex min-h-16 items-center justify-between gap-4 bg-background px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{jury.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("jury.login.member")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={t("jury.login.selectMember", {
                      name: jury.name,
                    })}
                    onClick={() => handleSelect(jury)}
                    disabled={isLoggingIn}
                    className="shrink-0 rounded-none border-primary text-primary"
                  >
                    {t("jury.login.select")}
                  </Button>
                </div>
              ))
            )}
          </div>

          {step.kind === "confirm" && (
            <div className="border-2 border-primary bg-primary/5 p-4">
              <h2 className="font-semibold">
                {t("jury.login.confirmTitle", { name: step.jury.name })}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("jury.login.confirmDescription")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep({ kind: "search" })}
                  disabled={isLoggingIn}
                  className="h-11 rounded-none"
                >
                  {t("jury.login.chooseAgain")}
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isLoggingIn}
                  className="h-11 rounded-none"
                >
                  {isLoggingIn
                    ? t("jury.login.loggingIn")
                    : t("jury.login.continue")}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
