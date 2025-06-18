import { createLazyFileRoute } from '@tanstack/react-router';
import { Login } from '@/components/ui/Login';

export const Route = createLazyFileRoute('/login')({
    component: Login,
}); 