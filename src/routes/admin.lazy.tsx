import { createLazyFileRoute } from "@tanstack/react-router";
import { JuryTable } from "@/components/ui/JuryTable";
import { ParticipantSelector } from "@/components/ui/ParticipantSelector";
import { Card } from "@/components/shadcn/card";

export const Route = createLazyFileRoute("/admin")({
    component: AdminPanel,
});

function AdminPanel() {
    return (
        <div className="container mx-auto p-8 space-y-8">
            <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>

            <div className="grid grid-cols-1 gap-8">
                <Card className="p-6">
                    <h2 className="text-2xl font-semibold mb-6">Jury Status</h2>
                    <JuryTable />
                </Card>

                <Card className="p-6">
                    <h2 className="text-2xl font-semibold mb-6">Active Participant</h2>
                    <ParticipantSelector />
                </Card>
            </div>
        </div>
    );
} 