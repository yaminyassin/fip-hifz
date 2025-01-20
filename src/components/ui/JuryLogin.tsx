import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Card } from "@/components/shadcn/card";
import { useToast } from "@/components/shadcn/use-toast";
import { authenticateJury, setAuthenticatedJury } from "@/services/juryAuth";

interface JuryLoginProps {
  onLoginSuccess: () => void;
}

export const JuryLogin = ({ onLoginSuccess }: JuryLoginProps) => {
  const [juryCode, setJuryCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const jury = await authenticateJury(juryCode);

      if (jury) {
        setAuthenticatedJury(jury.id);
        toast({
          title: "Login Successful",
          description: "Welcome to the Jury Panel",
        });
        onLoginSuccess();
      } else {
        toast({
          title: "Invalid Code",
          description: "Please check your jury code and try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while logging in",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToMain = () => {
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-center mb-8">Jury Login</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="juryCode" className="text-sm font-medium">
              Enter Jury Code
            </label>
            <Input
              id="juryCode"
              type="text"
              value={juryCode}
              onChange={(e) => setJuryCode(e.target.value)}
              placeholder="Enter your jury code"
              className="w-full"
              required
              autoFocus
            />
          </div>
          <div className="space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !juryCode.trim()}
            >
              {isLoading ? "Logging in..." : "Login"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleBackToMain}
            >
              Back to Main Screen
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}; 