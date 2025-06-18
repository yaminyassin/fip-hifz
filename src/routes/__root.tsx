import { Outlet, redirect, rootRouteWithContext } from '@tanstack/react-router';
// import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Toaster } from '@/components/shadcn/toaster';
import '../i18n'; // Import i18n configuration
import type { useAuth } from '@/hooks/useAuth';

export interface RouterContext {
  auth: ReturnType<typeof useAuth>;
}

export const Route = rootRouteWithContext<RouterContext>()({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated && location.pathname !== '/login') {
      throw redirect({
        to: '/login',
        search: { redirect: location.pathname },
      });
    }
    if (context.auth.isAuthenticated && location.pathname === '/login') {
      throw redirect({ to: '/' });
    }
  },
  component: () => (
    <>
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
      <Toaster />
    </>
  ),
});
