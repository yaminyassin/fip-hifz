import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Users,
  MonitorPlay,
  Shuffle,
  Scale,
  Trophy,
  GraduationCap,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { MagicCard } from "@/components/shadcn/magic-card";
import { cn } from "@/lib/utils";
import BlurIn from "@/components/shadcn/blur-in";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { EventSelector } from "@/components/ui/EventSelector";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const search = useSearch({ from: '/' });
  const auth = useAuth();
  
  // Get event from URL parameters
  const eventId = (search as { event?: string }).event;
  const isAuthenticated = eventId ? auth.isEventAuthenticated(eventId) : false;
  
  const handleLogout = () => {
    auth.logout();
    // Redirect back to event selection
    navigate({ to: '/' });
  };

  const bentoItems = [
    {
      title: t("menu.bigScreen"),
      description: t("menu.bigScreenDesc"),
      icon: MonitorPlay,
      route: "/big-screen",
      className: "md:col-span-2 row-span-1",
    },
    {
      title: t("menu.randomizer"),
      description: t("menu.randomizerDesc"),
      icon: Shuffle,
      route: "/randomizer",
      className: "md:col-span-1 row-span-1",
    },
    {
      title: t("menu.jury"),
      description: t("menu.juryDesc"),
      icon: Scale,
      route: "/jury",
      className: "md:col-span-1 row-span-2",
    },
    {
      title: t("menu.participants"),
      description: t("menu.participantsDesc"),
      icon: Users,
      route: "/participants",
      className: "md:col-span-2 row-span-1",
    },
    {
      title: t("menu.admin"),
      description: t("menu.adminDesc"),
      icon: Settings,
      route: "/admin",
      className: "md:col-span-2 row-span-1",
    },
    {
      title: t("menu.quranPage"),
      description: t("menu.quranPageDesc"),
      icon: BookOpen,
      route: "/quran-page",
      className: "md:col-span-1 row-span-1",
    },
    {
      title: t("menu.competition"),
      description: t("menu.competitionDesc"),
      icon: Trophy,
      className: "md:col-span-1 row-span-1",
    },
    {
      title: t("menu.schools"),
      description: t("menu.schoolsDesc"),
      icon: GraduationCap,
      className: "md:col-span-1 row-span-1",
    },
    {
      title: t("menu.results"),
      description: t("menu.resultsDesc"),
      icon: BookOpen,
      className: "md:col-span-1 row-span-1",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-6 md:p-12">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-4">
        <LanguageSwitcher />
        {isAuthenticated && eventId && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {eventId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        )}
      </div>
      
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <BlurIn
            word={isAuthenticated && eventId ? `${eventId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${t("home.title")}` : t("home.title")}
            className="text-4xl font-bold tracking-tight md:text-4xl md:leading-normal"
            duration={0.25}
            variant={{
              hidden: { filter: "blur(8px)", opacity: 0 },
              visible: { filter: "blur(0px)", opacity: 1 },
            }}
          />
          <BlurIn
            word={isAuthenticated && eventId ? "Competition management dashboard" : t("home.subtitle")}
            className="text-muted-foreground text-base md:text-base md:leading-normal"
            duration={0.25}
            variant={{
              hidden: { filter: "blur(4px)", opacity: 0 },
              visible: { filter: "blur(0px)", opacity: 1 },
            }}
          />
        </div>

        {isAuthenticated && eventId ? (
          /* Show navigation menu for authenticated users */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[100px]">
            {bentoItems.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "group/bento transform transition-all duration-300 hover:scale-[1.02]",
                  item.className
                )}
                onClick={() => item.route && navigate({ to: `${item.route}?event=${eventId}` as never })}
              >
                <MagicCard
                  className="h-full cursor-pointer shadow-none transition-shadow duration-300 group-hover/bento:shadow-xl"
                  gradientColor="hsl(var(--primary) / 0.3)"
                  gradientSize={200}
                  gradientOpacity={0.15}
                >
                  <div className="flex h-full flex-col justify-between p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <item.icon className="h-5 w-5 text-muted-foreground transition-colors duration-300 group-hover:text-primary" />
                        <span className="font-medium transition-colors duration-300 group-hover:text-primary">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 transition-colors duration-300 group-hover:text-primary/80">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </MagicCard>
              </motion.div>
            ))}
          </div>
        ) : (
          /* Show event selection for non-authenticated users */
          <div className="mb-8">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4">🏆 Competition Management System</h2>
              <p className="text-gray-600 mb-6">
                Select an event to access. Each event has its own secure access.
              </p>
              <EventSelector />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/")({
  component: Home,
});
