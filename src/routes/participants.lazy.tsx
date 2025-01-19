import { createLazyFileRoute } from "@tanstack/react-router";
import { ParticipantsTable } from "@/components/ui/ParticipantsTable";
import { FloatingParticipantList } from "@/components/ui/FloatingParticipantList";

import { Input } from "@/components/shadcn/input";
import { Search } from "lucide-react";
import { useState } from "react";
import { useParticipants } from "@/hooks/useParticipants";

export const Route = createLazyFileRoute("/participants")({
  component: RouteComponent,
});

function RouteComponent() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: participants = [], isLoading } = useParticipants();

  const filteredParticipants = participants.filter((participant) =>
    participant.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Participants</h1>
          <div className="relative w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search participants..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <ParticipantsTable participants={filteredParticipants} />
        </div>

        <FloatingParticipantList participants={filteredParticipants} />
      </div>
    </div>
  );
}
