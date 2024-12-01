import { createLazyFileRoute } from "@tanstack/react-router";

const BigScreen = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-primary/50 flex items-center justify-center">
      <div className="flex flex-col gap-4 w-64">
        <h1>Big Screen</h1>
      </div>
    </div>
  );
};

export const Route = createLazyFileRoute("/big-screen")({
  component: BigScreen,
});
