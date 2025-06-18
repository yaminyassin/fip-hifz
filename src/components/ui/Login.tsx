// src/components/ui/Login.tsx

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';

export function Login() {
    const { t } = useTranslation();
    const auth = useAuth();
    const navigate = useNavigate();
    const search = useSearch({ from: '/login' });

    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            await auth.login(password);
            const redirectPath = (search as { redirect?: string }).redirect || '/';
            navigate({ to: redirectPath as any });
        } catch (err) {
            setError(t('login.error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
            <Card className="w-full max-w-md p-6 space-y-6 bg-card/80 backdrop-blur-sm">
                <CardHeader className="p-0 mb-4 text-center">
                    <CardTitle className="text-2xl font-bold">{t('login.title')}</CardTitle>
                    <CardDescription>{t('login.subtitle')}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">{t('login.password')}</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? t('login.loggingIn') : t('login.button')}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
} 