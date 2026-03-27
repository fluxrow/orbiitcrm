import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { StatsCard } from "@/components/orbit/StatsCard";
import {
  Users,
  MessageSquare,
  TrendingUp,
  DollarSign,
  Target,
  Clock,
  Loader2,
} from "lucide-react";
import { CampaignAnalyticsSection } from "@/components/orbit/CampaignAnalyticsSection";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useTenant } from "@/contexts/TenantContext";
import { useOrbitAnalyticsSummary } from "@/hooks/useOrbitAnalytics";

const ORIGIN_COLORS = [
  "hsl(142, 70%, 45%)",
  "hsl(210, 80%, 55%)",
  "hsl(330, 80%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(187, 92%, 50%)",
  "hsl(270, 60%, 55%)",
  "hsl(15, 80%, 55%)",
  "hsl(60, 70%, 45%)",
];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return `R$ ${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

export default function AnalyticsPage() {
  const { empresaId } = useTenant();
  const { data: summary, isLoading } = useOrbitAnalyticsSummary(empresaId);

  // Merge prospects + deals into conversion chart data
  const conversionData = summary
    ? summary.prospectsPorMes.map((p) => {
        const dealMonth = summary.dealsPorMes.find((d) => d.month === p.month);
        return {
          name: p.month,
          leads: p.leads,
          oportunidades: dealMonth?.total ?? 0,
          fechados: dealMonth?.won ?? 0,
        };
      })
    : [];

  const channelData = summary
    ? summary.origemDistribution.map((item, i) => ({
        ...item,
        color: ORIGIN_COLORS[i % ORIGIN_COLORS.length],
      }))
    : [];

  const performanceData = summary?.performanceEquipe ?? [];

  // Ticket médio
  const ticketMedio =
    summary && summary.dealsWon > 0
      ? summary.pipelineTotal / Math.max(summary.dealsWon, 1)
      : 0;

  if (isLoading) {
    return (
      <OrbitLayout>
        <PageHeader title="Analytics" description="Métricas e performance do seu CRM" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </OrbitLayout>
    );
  }

  return (
    <OrbitLayout>
      <PageHeader
        title="Analytics"
        description="Métricas e performance do seu CRM"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Total de Leads"
          value={formatNumber(summary?.totalProspects ?? 0)}
          change={`${summary?.prospectChangePercent ?? 0 >= 0 ? "+" : ""}${summary?.prospectChangePercent ?? 0}% vs mês anterior`}
          changeType={summary && summary.prospectChangePercent >= 0 ? "positive" : "negative"}
          icon={Users}
        />
        <StatsCard
          title="Conversas Ativas"
          value={formatNumber(summary?.conversasAtivas ?? 0)}
          change={`+${summary?.conversasOntem ?? 0} desde ontem`}
          changeType="positive"
          icon={MessageSquare}
        />
        <StatsCard
          title="Taxa de Conversão"
          value={`${summary?.taxaConversao ?? 0}%`}
          change={`${summary?.taxaConversaoChange ?? 0 >= 0 ? "+" : ""}${summary?.taxaConversaoChange ?? 0}% vs mês anterior`}
          changeType={summary && summary.taxaConversaoChange >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
        />
        <StatsCard
          title="Pipeline Total"
          value={formatCurrency(summary?.pipelineTotal ?? 0)}
          change={`${summary?.pipelineChangePercent ?? 0 >= 0 ? "+" : ""}${summary?.pipelineChangePercent ?? 0}% vs mês anterior`}
          changeType={summary && summary.pipelineChangePercent >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Conversion Funnel Chart */}
        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="font-semibold mb-4">Funil de Conversão</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={conversionData}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(187, 92%, 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(187, 92%, 50%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOpp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFechados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
              <XAxis dataKey="name" stroke="hsl(215, 20%, 55%)" />
              <YAxis stroke="hsl(215, 20%, 55%)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(222, 47%, 8%)",
                  border: "1px solid hsl(222, 30%, 18%)",
                  borderRadius: "8px",
                }}
              />
              <Area type="monotone" dataKey="leads" stroke="hsl(187, 92%, 50%)" fillOpacity={1} fill="url(#colorLeads)" />
              <Area type="monotone" dataKey="oportunidades" stroke="hsl(38, 92%, 50%)" fillOpacity={1} fill="url(#colorOpp)" />
              <Area type="monotone" dataKey="fechados" stroke="hsl(142, 76%, 36%)" fillOpacity={1} fill="url(#colorFechados)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Channel Distribution */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Origem dos Leads</h3>
          {channelData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={channelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(222, 47%, 8%)",
                      border: "1px solid hsl(222, 30%, 18%)",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                {channelData.map((channel) => (
                  <div key={channel.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: channel.color }} />
                    <span className="text-muted-foreground">{channel.name}</span>
                    <span className="font-medium">{channel.value}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-10">Sem dados de origem</p>
          )}
        </div>
      </div>

      {/* Performance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team Performance */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Performance da Equipe</h3>
          {performanceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={performanceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                <XAxis type="number" stroke="hsl(215, 20%, 55%)" />
                <YAxis dataKey="name" type="category" stroke="hsl(215, 20%, 55%)" width={100} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 47%, 8%)",
                    border: "1px solid hsl(222, 30%, 18%)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="leads" fill="hsl(187, 92%, 50%)" radius={[0, 4, 4, 0]} name="Leads" />
                <Bar dataKey="conversao" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} name="Convertidos" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-10">Sem dados de equipe</p>
          )}
        </div>

        {/* Additional Stats */}
        <div className="space-y-4">
          <StatsCard
            title="Taxa de Qualificação"
            value={`${summary?.taxaConversao ?? 0}%`}
            change={`${summary?.taxaConversaoChange ?? 0 >= 0 ? "+" : ""}${summary?.taxaConversaoChange ?? 0}% vs mês anterior`}
            changeType={summary && summary.taxaConversaoChange >= 0 ? "positive" : "negative"}
            icon={Target}
          />
          <StatsCard
            title="Ticket Médio"
            value={formatCurrency(ticketMedio)}
            icon={DollarSign}
          />
          <StatsCard
            title="Deals Ganhos"
            value={formatNumber(summary?.dealsWon ?? 0)}
            change={`de ${formatNumber(summary?.dealsTotal ?? 0)} total`}
            changeType="positive"
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* Campaign Email Analytics */}
      <div className="mt-6">
        <CampaignAnalyticsSection />
      </div>
    </OrbitLayout>
  );
}
