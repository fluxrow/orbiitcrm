import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { StatsCard } from "@/components/orbit/StatsCard";
import { ProspectCard } from "@/components/orbit/ProspectCard";
import { ConversationItem } from "@/components/orbit/ConversationItem";
import { Button } from "@/components/ui/button";
import {
  Users,
  MessageSquare,
  TrendingUp,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";

const recentProspects = [
  {
    id: "1",
    nome_razao: "Tech Solutions Ltda",
    nome_fantasia: "TechSol",
    cidade: "São Paulo",
    segmento: "Tecnologia",
    status: "novo" as const,
    canal_origem: "whatsapp" as const,
  },
  {
    id: "2",
    nome_razao: "Indústria ABC S.A.",
    cidade: "Campinas",
    segmento: "Manufatura",
    status: "em_contato" as const,
    canal_origem: "email" as const,
  },
];

const recentConversations = [
  {
    id: "1",
    nome: "João Silva",
    ultimaMensagem: "Perfeito, vamos agendar a reunião",
    data: "10:30",
    naoLidas: 2,
    canal: "whatsapp" as const,
  },
  {
    id: "2",
    nome: "Maria Santos",
    ultimaMensagem: "Enviamos a proposta por email",
    data: "Ontem",
    naoLidas: 0,
    canal: "email" as const,
  },
  {
    id: "3",
    nome: "Pedro Costa",
    ultimaMensagem: "Vi seu perfil e gostaria de saber mais",
    data: "Ontem",
    naoLidas: 1,
    canal: "instagram" as const,
  },
];

export default function OrbitDashboard() {
  const { basePath } = useTenant();

  return (
    <OrbitLayout>
      <PageHeader
        title="Dashboard"
        description="Visão geral do seu CRM de prospecção"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total de Leads"
          value="1,234"
          change="+12% vs mês anterior"
          changeType="positive"
          icon={Users}
        />
        <StatsCard
          title="Conversas Ativas"
          value="89"
          change="+5 desde ontem"
          changeType="positive"
          icon={MessageSquare}
        />
        <StatsCard
          title="Taxa de Conversão"
          value="23.5%"
          change="+2.1% vs mês anterior"
          changeType="positive"
          icon={TrendingUp}
        />
        <StatsCard
          title="Pipeline Total"
          value="R$ 520K"
          change="+15% vs mês anterior"
          changeType="positive"
          icon={DollarSign}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Prospects */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Prospects Recentes</h2>
            <Link to={`${basePath}/prospects`}>
              <Button variant="ghost" size="sm">
                Ver todos
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="space-y-3">
            {recentProspects.map((prospect) => (
              <ProspectCard key={prospect.id} prospect={prospect} />
            ))}
          </div>
        </div>

        {/* Recent Conversations */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Conversas Recentes</h2>
            <Link to={`${basePath}/conversas`}>
              <Button variant="ghost" size="sm">
                Ver todas
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="space-y-1">
            {recentConversations.map((conv) => (
              <ConversationItem key={conv.id} conversation={conv} />
            ))}
          </div>
        </div>
      </div>
    </OrbitLayout>
  );
}
