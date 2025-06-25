import { Outlet, createRootRoute, redirect } from '@tanstack/react-router';
// import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Toaster } from '@/components/shadcn/toaster';
import '../i18n'; // Import i18n configuration

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const searchParams = new URLSearchParams(location.search);
    const eventId = searchParams.get('event');
    
    // If visiting a protected route with an event parameter but not logged in
    if (eventId && location.pathname !== '/' && location.pathname !== '/login') {
      // Check if authenticated for this specific event
      const authenticatedEvents = sessionStorage.getItem('authenticatedEvents');
      const eventSet = authenticatedEvents ? new Set(JSON.parse(authenticatedEvents)) : new Set();
      
      if (!eventSet.has(eventId)) {
        throw redirect({
          to: '/login',
          search: { event: eventId },
        });
      }
    }
    
    // If visiting login but already authenticated for that event, redirect to main page
    if (location.pathname === '/login' && eventId) {
      const authenticatedEvents = sessionStorage.getItem('authenticatedEvents');
      const eventSet = authenticatedEvents ? new Set(JSON.parse(authenticatedEvents)) : new Set();
      
      if (eventSet.has(eventId)) {
        throw redirect({ 
          to: '/',
          search: { event: eventId }
        });
      }
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
