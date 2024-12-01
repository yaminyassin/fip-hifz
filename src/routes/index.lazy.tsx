import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/shadcn/button";

const Home = () => {
  const navigation = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-primary/50 flex items-center justify-center">
      <div className="flex flex-col gap-4 w-64">
        <Button
          variant="secondary"
          onClick={() => navigation({ to: "/big-screen" })}
        >
          Big Screen
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigation({ to: "/randomizer" })}
        >
          Randomizer
        </Button>
        <Button variant="secondary" onClick={() => navigation({ to: "/jury" })}>
          Jury
        </Button>
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/")({
  component: Home,
});
