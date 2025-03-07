import { createLazyFileRoute } from "@tanstack/react-router";
import { JuryTable } from "@/components/ui/JuryTable";
import { ParticipantSelector } from "@/components/ui/ParticipantSelector";
import { ParticipantManagement } from "@/components/ui/ParticipantManagement";
import { Card } from "@/components/shadcn/card";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";

export const Route = createLazyFileRoute("/admin")({
    component: AdminPanel,
});

function AdminPanel() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'control' | 'participants'>('control');

    return (
        <div className="container mx-auto p-8 space-y-8">
            <h1 className="text-3xl font-bold mb-8">{t("admin.title")}</h1>

            {/* Tab Navigation */}
            <div className="border-b mb-6">
                <div className="flex space-x-4">
                    <Button
                        variant={activeTab === 'control' ? "default" : "outline"}
                        onClick={() => setActiveTab('control')}
                        className={`pb-2 ${activeTab === 'control' ? 'border-2 border-primary shadow-sm' : 'border-2'}`}
                    >
                        {t("admin.tabs.control")}
                    </Button>
                    <Button
                        variant={activeTab === 'participants' ? "default" : "outline"}
                        onClick={() => setActiveTab('participants')}
                        className={`pb-2 ${activeTab === 'participants' ? 'border-2 border-primary shadow-sm' : 'border-2'}`}
                    >
                        {t("admin.tabs.participants")}
                    </Button>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'control' ? (
                <div className="grid grid-cols-1 gap-8">
                    <Card className="p-6">
                        <h2 className="text-2xl font-semibold mb-6">{t("admin.juryStatus")}</h2>
                        <JuryTable />
                    </Card>

                    <Card className="p-6">
                        <h2 className="text-2xl font-semibold mb-6">{t("admin.activeParticipant")}</h2>
                        <ParticipantSelector />
                    </Card>
                </div>
            ) : (
                <Card className="p-6">
                    <ParticipantManagement />
                </Card>
            )}
        </div>
    );
} 