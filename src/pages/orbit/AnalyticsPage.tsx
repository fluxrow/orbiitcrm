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

const conversionData = [
  { name: "Jan", leads: 45, oportunidades: 28, fechados: 12 },
  { name: "Fev", leads: 52, oportunidades: 35, fechados: 18 },
  { name: "Mar", leads: 48, oportunidades: 32, fechados: 15 },
  { name: "Abr", leads: 70, oportunidades: 48, fechados: 22 },
  { name: "Mai", leads: 65, oportunidades: 42, fechados: 20 },
  { name: "Jun", leads: 80, oportunidades: 55, fechados: 28 },
];

const channelData = [
  { name: "WhatsApp", value: 45, color: "hsl(142, 70%, 45%)" },
  { name: "Email", value: 30, color: "hsl(210, 80%, 55%)" },
  { name: "Instagram", value: 15, color: "hsl(330, 80%, 60%)" },
  { name: "Manual", value: 10, color: "hsl(38, 92%, 50%)" },
];

const performanceData = [
  { name: "Ana Silva", leads: 45, conversao: 28 },
  { name: "Carlos Santos", leads: 38, conversao: 22 },
  { name: "Maria Costa", leads: 52, conversao: 35 },
  { name: "João Lima", leads: 31, conversao: 18 },
];

export default function AnalyticsPage() {
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
              <Area
                type="monotone"
                dataKey="leads"
                stroke="hsl(187, 92%, 50%)"
                fillOpacity={1}
                fill="url(#colorLeads)"
              />
              <Area
                type="monotone"
                dataKey="oportunidades"
                stroke="hsl(38, 92%, 50%)"
                fillOpacity={1}
                fill="url(#colorOpp)"
              />
              <Area
                type="monotone"
                dataKey="fechados"
                stroke="hsl(142, 76%, 36%)"
                fillOpacity={1}
                fill="url(#colorFechados)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Channel Distribution */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Canais de Origem</h3>
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
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: channel.color }}
                />
                <span className="text-muted-foreground">{channel.name}</span>
                <span className="font-medium">{channel.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team Performance */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Performance da Equipe</h3>
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
              <Bar dataKey="leads" fill="hsl(187, 92%, 50%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="conversao" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Additional Stats */}
        <div className="space-y-4">
          <StatsCard
            title="Tempo Médio de Resposta"
            value="12 min"
            change="-3 min vs semana anterior"
            changeType="positive"
            icon={Clock}
          />
          <StatsCard
            title="Taxa de Qualificação"
            value="42%"
            change="+5% vs mês anterior"
            changeType="positive"
            icon={Target}
          />
          <StatsCard
            title="Ticket Médio"
            value="R$ 45K"
            change="+8% vs mês anterior"
            changeType="positive"
            icon={DollarSign}
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
