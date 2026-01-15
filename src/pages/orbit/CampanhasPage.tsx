import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Play,
  Pause,
  BarChart3,
  MessageCircle,
  Mail,
  Users,
  Send,
  Eye,
  MousePointer,
} from "lucide-react";

const mockCampaigns = [
  {
    id: "1",
    nome: "Prospecção Q1 2024",
    tipo: "whatsapp",
    status: "ativa",
    leads: 250,
    enviadas: 180,
    abertas: 145,
    cliques: 42,
    respostas: 28,
    dataInicio: "2024-01-10",
  },
  {
    id: "2",
    nome: "Newsletter Mensal",
    tipo: "email",
    status: "pausada",
    leads: 1500,
    enviadas: 1450,
    abertas: 680,
    cliques: 120,
    respostas: 45,
    dataInicio: "2024-01-01",
  },
  {
    id: "3",
    nome: "Follow-up Clientes",
    tipo: "whatsapp",
    status: "rascunho",
    leads: 80,
    enviadas: 0,
    abertas: 0,
    cliques: 0,
    respostas: 0,
    dataInicio: null,
  },
];

const statusConfig = {
  ativa: { label: "Ativa", className: "bg-success/20 text-success" },
  pausada: { label: "Pausada", className: "bg-warning/20 text-warning" },
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  finalizada: { label: "Finalizada", className: "bg-primary/20 text-primary" },
};

export default function CampanhasPage() {
  return (
    <OrbitLayout>
      <PageHeader
        title="Campanhas"
        description="Gerencie suas campanhas de email e WhatsApp"
        action={
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nova Campanha
          </Button>
        }
      />

      <div className="space-y-4">
        {mockCampaigns.map((campaign) => {
          const status = statusConfig[campaign.status as keyof typeof statusConfig];
          const taxaAbertura = campaign.enviadas > 0
            ? ((campaign.abertas / campaign.enviadas) * 100).toFixed(1)
            : 0;
          const taxaResposta = campaign.enviadas > 0
            ? ((campaign.respostas / campaign.enviadas) * 100).toFixed(1)
            : 0;

          return (
            <div key={campaign.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl ${
                      campaign.tipo === "whatsapp"
                        ? "bg-channel-whatsapp/20 text-channel-whatsapp"
                        : "bg-channel-email/20 text-channel-email"
                    }`}
                  >
                    {campaign.tipo === "whatsapp" ? (
                      <MessageCircle className="w-5 h-5" />
                    ) : (
                      <Mail className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold">{campaign.nome}</h3>
                    <p className="text-sm text-muted-foreground">
                      {campaign.dataInicio
                        ? `Iniciada em ${new Date(campaign.dataInicio).toLocaleDateString("pt-BR")}`
                        : "Não iniciada"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={status.className}>{status.label}</Badge>
                  {campaign.status === "ativa" && (
                    <Button variant="ghost" size="icon">
                      <Pause className="w-4 h-4" />
                    </Button>
                  )}
                  {campaign.status === "pausada" && (
                    <Button variant="ghost" size="icon">
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon">
                    <BarChart3 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-4">
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <Users className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{campaign.leads}</p>
                  <p className="text-xs text-muted-foreground">Leads</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <Send className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{campaign.enviadas}</p>
                  <p className="text-xs text-muted-foreground">Enviadas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <Eye className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{taxaAbertura}%</p>
                  <p className="text-xs text-muted-foreground">Abertura</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <MousePointer className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{campaign.cliques}</p>
                  <p className="text-xs text-muted-foreground">Cliques</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <MessageCircle className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-bold">{taxaResposta}%</p>
                  <p className="text-xs text-muted-foreground">Respostas</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </OrbitLayout>
  );
}
