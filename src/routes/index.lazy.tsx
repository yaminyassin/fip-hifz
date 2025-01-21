import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
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
} from "lucide-react";
import { MagicCard } from "@/components/shadcn/magic-card";
import { cn } from "@/lib/utils";
import BlurIn from "@/components/shadcn/blur-in";
import { useTranslation } from "react-i18next";

const Home = () => {
  const navigation = useNavigate();
  const { t } = useTranslation();

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
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <BlurIn
            word={t("home.title")}
            className="text-4xl font-bold tracking-tight md:text-4xl md:leading-normal"
            duration={0.25}
            variant={{
              hidden: { filter: "blur(8px)", opacity: 0 },
              visible: { filter: "blur(0px)", opacity: 1 },
            }}
          />
          <BlurIn
            word={t("home.subtitle")}
            className="text-muted-foreground text-base md:text-base md:leading-normal"
            duration={0.25}
            variant={{
              hidden: { filter: "blur(4px)", opacity: 0 },
              visible: { filter: "blur(0px)", opacity: 1 },
            }}
          />
        </div>

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
              onClick={() => item.route && navigation({ to: item.route })}
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
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/")({
  component: Home,
});
