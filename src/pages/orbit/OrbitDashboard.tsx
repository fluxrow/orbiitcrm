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
  CheckSquare,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useOrbitProspects, useOrbitProspectsCount } from "@/hooks/useOrbitProspects";
import { useOrbitConversas } from "@/hooks/useOrbitConversas";
import { useOrbitDeals } from "@/hooks/useOrbitDeals";
import { useOrbitTasks } from "@/hooks/useOrbitTasks";
import { formatDistanceToNow, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function OrbitDashboard() {
  const { basePath } = useTenant();
  const { data: prospects, isLoading: loadingProspects } = useOrbitProspects();
  const { data: totalProspectsCount } = useOrbitProspectsCount();
  const { data: conversas, isLoading: loadingConversas } = useOrbitConversas();
  const { data: deals } = useOrbitDeals();
  const { data: allTasks } = useOrbitTasks();

  const totalProspects = totalProspectsCount ?? 0;
  const conversasAtivas = conversas?.length ?? 0;

  const pipelineTotal = deals?.reduce(
    (sum, d) => sum + (Number(d.valor_estimado) || 0),
    0
  ) ?? 0;

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
    return `R$ ${value.toFixed(0)}`;
  };

  const taxaConversao =
    totalProspects > 0 && deals
      ? ((deals.length / totalProspects) * 100).toFixed(1)
      : "0";

  // Map real prospects to ProspectCard format
  const recentProspects = (prospects ?? []).slice(0, 3).map((p) => ({
    id: p.id,
    nome_razao: p.nome_razao,
    nome_fantasia: p.nome_fantasia ?? undefined,
    email_principal: p.email_principal ?? undefined,
    telefone: p.telefone_whatsapp ?? undefined,
    cidade: p.cidade ?? undefined,
    segmento: p.segmento ?? undefined,
    status: (p.status_qualificacao ?? "novo") as "novo" | "em_contato" | "qualificado" | "nao_qualificado",
    canal_origem: (p.origem_contato ?? undefined) as "whatsapp" | "instagram" | "email" | "manual" | undefined,
  }));

  // Map real conversations to ConversationItem format
  const recentConversations = (conversas ?? []).slice(0, 5).map((c) => ({
    id: c.id,
    nome: (c as any).prospect?.nome_razao ?? c.telefone_whatsapp,
    ultimaMensagem: c.ultima_mensagem_preview ?? "",
    data: c.ultima_mensagem_at
      ? formatDistanceToNow(new Date(c.ultima_mensagem_at), { addSuffix: false, locale: ptBR })
      : "",
    naoLidas: c.mensagens_nao_lidas ?? 0,
    canal: (c.canal ?? "whatsapp") as "whatsapp" | "instagram" | "email",
  }));

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
          value={totalProspects.toLocaleString("pt-BR")}
          change={`${totalProspects} cadastrados`}
          changeType="neutral"
          icon={Users}
        />
        <StatsCard
          title="Conversas Ativas"
          value={conversasAtivas.toString()}
          change={`${conversasAtivas} abertas`}
          changeType="neutral"
          icon={MessageSquare}
        />
        <StatsCard
          title="Taxa de Conversão"
          value={`${taxaConversao}%`}
          change={deals ? `${deals.length} deals` : "0 deals"}
          changeType="neutral"
          icon={TrendingUp}
        />
        <StatsCard
          title="Pipeline Total"
          value={formatCurrency(pipelineTotal)}
          change={deals ? `${deals.length} negócios` : "Sem negócios"}
          changeType="neutral"
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
            {loadingProspects ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : recentProspects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum prospect cadastrado</p>
            ) : (
              recentProspects.map((prospect) => (
                <ProspectCard key={prospect.id} prospect={prospect} />
              ))
            )}
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
            {loadingConversas ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : recentConversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conversa ativa</p>
            ) : (
              recentConversations.map((conv) => (
                <ConversationItem key={conv.id} conversation={conv} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tasks Widget */}
      <div className="glass-card p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <CheckSquare className="w-4 h-4" /> Minhas Tarefas
          </h2>
          <Link to={`${basePath}/tarefas`}>
            <Button variant="ghost" size="sm">
              Ver todas <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        {(() => {
          const pendingTasks = (allTasks || []).filter((t: any) => t.status !== "completed");
          const overdue = pendingTasks.filter((t: any) => t.due_date && isPast(new Date(t.due_date + "T23:59:59")) && !isToday(new Date(t.due_date)));
          const todayTasks = pendingTasks.filter((t: any) => t.due_date && isToday(new Date(t.due_date)));
          const upcoming = pendingTasks.filter((t: any) => !t.due_date || (!isPast(new Date(t.due_date + "T23:59:59")) && !isToday(new Date(t.due_date)))).slice(0, 3);

          if (pendingTasks.length === 0) {
            return <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa pendente 🎉</p>;
          }

          return (
            <div className="space-y-2">
              {overdue.length > 0 && (
                <div className="text-xs font-medium text-destructive mb-1">⚠️ {overdue.length} tarefa(s) atrasada(s)</div>
              )}
              {[...overdue.slice(0, 2), ...todayTasks.slice(0, 3), ...upcoming].slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 text-sm">
                  <span className="text-xs">{t.due_date && isPast(new Date(t.due_date + "T23:59:59")) && !isToday(new Date(t.due_date)) ? "🔴" : isToday(new Date(t.due_date)) ? "🟡" : "⚪"}</span>
                  <span className="flex-1 truncate">{t.titulo}</span>
                  {t.prospect?.nome_razao && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{t.prospect.nome_razao}</span>}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </OrbitLayout>
  );
}
