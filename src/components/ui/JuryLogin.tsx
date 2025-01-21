import { useState } from "react";
import { Card } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { useToast } from "@/components/shadcn/use-toast";
import { authenticateJury, setAuthenticatedJury } from "@/services/juryAuth";
import { useTranslation } from "react-i18next";

interface JuryLoginProps {
    onLoginSuccess: () => void;
}

export const JuryLogin = ({ onLoginSuccess }: JuryLoginProps) => {
    const [juryId, setJuryId] = useState("");
    const { toast } = useToast();
    const { t } = useTranslation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        try {
            const isAuthenticated = await authenticateJury(juryId);
            if (isAuthenticated) {
                setAuthenticatedJury(juryId);
                onLoginSuccess();
            } else {
                toast({
                    title: t("jury.login.error.invalid"),
                    description: t("jury.login.error.invalidDesc"),
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: t("jury.login.error.failed"),
                description: t("jury.login.error.failedDesc"),
                variant: "destructive",
            });
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
                        />
                    </div>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={!juryId.trim()}
                    >
                        {t("jury.login.button")}
                    </Button>
                </form>
            </Card>
        </div>
    );
}; 