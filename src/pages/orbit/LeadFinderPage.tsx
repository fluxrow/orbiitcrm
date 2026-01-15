import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LeadFinderTabs } from "@/components/lead-finder/LeadFinderTabs";
import { DashboardTab } from "@/components/lead-finder/DashboardTab";
import { NewSearchTab } from "@/components/lead-finder/NewSearchTab";
import { LeadsTab } from "@/components/lead-finder/LeadsTab";
import { EnrichmentTab } from "@/components/lead-finder/EnrichmentTab";
import { MonitorTab } from "@/components/lead-finder/MonitorTab";
import { SourcesTab } from "@/components/lead-finder/SourcesTab";
import { LeadSearch } from "@/hooks/useLeadFinder";

export default function LeadFinderPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedSearch, setSelectedSearch] = useState<LeadSearch | null>(null);

  const handleViewSearch = (search: LeadSearch) => {
    setSelectedSearch(search);
    setActiveTab("leads");
  };

  const handleNewSearch = () => {
    setActiveTab("nova-busca");
  };

  const handleSearchCreated = (searchId: string) => {
    setActiveTab("leads");
  };

  return (
    <OrbitLayout>
      <PageHeader
        title="Buscador de Leads"
        description="Encontre e importe leads qualificados de múltiplas fontes"
        action={
          <Button onClick={() => setActiveTab("fontes")}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Fonte
          </Button>
        }
      />

      <div className="space-y-6">
        <LeadFinderTabs value={activeTab} onValueChange={setActiveTab} />

        <div className="mt-6">
          {activeTab === "dashboard" && (
            <DashboardTab
              onViewSearch={handleViewSearch}
              onNewSearch={handleNewSearch}
            />
          )}
          {activeTab === "nova-busca" && (
            <NewSearchTab onSearchCreated={handleSearchCreated} />
          )}
          {activeTab === "leads" && <LeadsTab />}
          {activeTab === "enrichment" && <EnrichmentTab />}
          {activeTab === "monitor" && <MonitorTab />}
          {activeTab === "fontes" && <SourcesTab />}
        </div>
      </div>
    </OrbitLayout>
  );
}
