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
} from "lucide-react";
import { MagicCard } from "@/components/shadcn/magic-card";
import { cn } from "@/lib/utils";
import BlurIn from "@/components/shadcn/blur-in";

const Home = () => {
  const navigation = useNavigate();

  const bentoItems = [
    {
      title: "Big Screen",
      description: "View competition display",
      icon: MonitorPlay,
      route: "/big-screen",
      className: "md:col-span-2 row-span-1",
    },
    {
      title: "Randomizer",
      description: "Generate random questions",
      icon: Shuffle,
      route: "/randomizer",
      className: "md:col-span-1 row-span-1",
    },
    {
      title: "Jury Panel",
      description: "Score participants",
      icon: Scale,
      route: "/jury",
      className: "md:col-span-1 row-span-2",
    },
    {
      title: "Participants",
      description: "Manage contestants",
      icon: Users,
      route: "/participants",
      className: "md:col-span-2 row-span-1",
    },
    {
      title: "Competition",
      description: "Event overview",
      icon: Trophy,
      className: "md:col-span-1 row-span-1",
    },
    {
      title: "Schools",
      description: "Participating institutions",
      icon: GraduationCap,
      className: "md:col-span-1 row-span-1",
    },
    {
      title: "Results",
      description: "Competition results",
      icon: BookOpen,
      className: "md:col-span-2 row-span-1",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-6 md:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <BlurIn
            word="Hifz Competition Dashboard"
            className="text-4xl font-bold tracking-tight md:text-4xl md:leading-normal"
            duration={0.25}
            variant={{
              hidden: { filter: "blur(8px)", opacity: 0 },
              visible: { filter: "blur(0px)", opacity: 1 },
            }}
          />
          <BlurIn
            word="Manage and oversee the competition proceedings"
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
