import { createLazyFileRoute } from "@tanstack/react-router";
import { ParticipantsTable } from "@/components/ui/ParticipantsTable";
import { MachineContext } from "../machines";

export const Route = createLazyFileRoute("/participants")({
  component: RouteComponent,
});

function RouteComponent() {
  const participants = MachineContext.useSelector(
    (state) => state.context.participants
  );

  return (
    <div className="flex flex-col p-4 gap-4">
      <h1 className="text-2xl font-bold">Participants</h1>
      <ParticipantsTable participants={participants} />
    </div>
  );
}
