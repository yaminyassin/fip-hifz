import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Toaster } from "@/components/shadcn/toaster";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import "../i18n"; // Import i18n configuration

export const Route = createRootRoute({
  component: () => (
    <>
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>
      <Outlet />
      <TanStackRouterDevtools />
      <Toaster />
    </>
  ),
});
