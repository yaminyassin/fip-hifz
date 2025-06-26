// src/components/ui/Login.tsx

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";

export function Login() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get event from URL parameters
  const eventId = (search as { event?: string }).event;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventId) {
      setError("No event specified");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await auth.login(eventId, password);
      // Redirect to main page with event context
      navigate({ to: `/?event=${eventId}` });
    } catch (err: any) {
      setError(err.message || t("login.error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md p-6 space-y-6 bg-card/80 backdrop-blur-sm">
        <CardHeader className="p-0 mb-4 text-center">
          <CardTitle className="text-2xl font-bold">
            {eventId
              ? `Access ${eventId.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}`
              : t("login.title")}
          </CardTitle>
          <CardDescription>
            {eventId
              ? `Enter the access code for ${eventId}`
              : t("login.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Event Access Code</Label>
              <Input
                id="password"
                type="password"
                placeholder="• • • • • • •"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-gray-400 text-center">
                Contact admin for authentication
              </p>
            </div>
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !eventId}
            >
              {isLoading ? "Authenticating..." : `Access ${eventId || "Event"}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: "/" })}
            >
              ← Back to Event Selection
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
