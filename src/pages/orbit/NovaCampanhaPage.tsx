import { useNavigate } from "react-router-dom";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { CampaignWizardContent } from "@/components/orbit/CampaignWizardContent";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NovaCampanhaPage() {
  const navigate = useNavigate();

  const handleBack = () => navigate("../campanhas");

  return (
    <OrbitLayout>
      <div className="flex flex-col h-full -m-6">
        {/* Page Header */}
        <div className="border-b bg-card px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Nova Campanha</h1>
              <p className="text-sm text-muted-foreground">Configure e crie sua campanha de envio</p>
            </div>
          </div>
        </div>

        {/* Wizard Content */}
        <CampaignWizardContent
          onComplete={handleBack}
          onCancel={handleBack}
        />
      </div>
    </OrbitLayout>
  );
}
