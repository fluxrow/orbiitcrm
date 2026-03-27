import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Mail, MailOpen, MousePointerClick, AlertTriangle, Info, Loader2,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Lightbulb,
  Send, Users, ShieldAlert, BarChart3, Filter,
  MessageCircle, CheckCheck, Eye, Reply, Phone, XCircle, Clock,
} from "lucide-react";
import { useOrbitCampaigns } from "@/hooks/useOrbitCampaigns";
import {
  useOrbitCampaignSummary,
  useOrbitCampaignRecipients,
  useOrbitCampaignTimeline,
  useWhatsAppCampaignSummary,
  useWhatsAppCampaignRecipients,
  type EngagementFilter,
  type WhatsAppEngagementFilter,
} from "@/hooks/useOrbitEmailAnalytics";
import { format } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

const PAGE_SIZE = 50;

/* ─── Badge Maps ─── */
const engagementBadge: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  delivered: { label: "Entregue", className: "bg-blue-500/20 text-blue-400" },
  engaged: { label: "Engajado", className: "bg-green-500/20 text-green-400" },
  bounced: { label: "Bounce", className: "bg-red-500/20 text-red-400" },
  complained: { label: "Spam", className: "bg-orange-500/20 text-orange-400" },
  no_interaction: { label: "Sem Interação", className: "bg-amber-500/20 text-amber-500" },
};

const whatsappStatusBadge: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  enviado: { label: "Enviado", className: "bg-blue-500/20 text-blue-400" },
  entregue: { label: "Entregue", className: "bg-cyan-500/20 text-cyan-400" },
  lido: { label: "Lido", className: "bg-green-500/20 text-green-400" },
  respondeu: { label: "Respondeu", className: "bg-emerald-500/20 text-emerald-400" },
  falhou: { label: "Falhou", className: "bg-red-500/20 text-red-400" },
  ignorado: { label: "Ignorado", className: "bg-muted text-muted-foreground" },
};

/* ─── Filter Options ─── */
const emailFilterOptions: { value: EngagementFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "abriu", label: "Abriu" },
  { value: "nao_abriu", label: "Não Abriu" },
  { value: "clicou", label: "Clicou" },
  { value: "nao_clicou", label: "Não Clicou" },
  { value: "falhou", label: "Falhou (Bounce/Spam)" },
];

const whatsappFilterOptions: { value: WhatsAppEngagementFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "enviado", label: "Enviado" },
  { value: "entregue", label: "Entregue" },
  { value: "lido", label: "Lido" },
  { value: "respondeu", label: "Respondeu" },
  { value: "falhou", label: "Falhou" },
  { value: "sem_resposta", label: "Sem Resposta" },
];

const intervalOptions = [
  { value: "1 hour", label: "Por Hora" },
  { value: "1 day", label: "Por Dia" },
  { value: "7 days", label: "7 Dias" },
];

/* ─── Metric Card ─── */
function MetricCard({
  icon, label, value, sub, trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-green-400" />}
        {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-2xl font-bold">{value}</p>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

/* ─── Funnel Step ─── */
function FunnelStep({
  label, value, maxValue, rate, color,
}: {
  label: string;
  value: number;
  maxValue: number;
  rate?: string;
  color: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-muted-foreground text-right shrink-0">{label}</div>
      <div className="flex-1 relative h-8 rounded-md overflow-hidden bg-muted/30">
        <div
          className="h-full rounded-md transition-all duration-500"
          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
        />
        <div className="absolute inset-0 flex items-center px-3">
          <span className="text-xs font-semibold text-foreground drop-shadow-sm">{value.toLocaleString()}</span>
        </div>
      </div>
      {rate && (
        <div className="w-14 text-xs font-medium text-muted-foreground text-right shrink-0">{rate}</div>
      )}
    </div>
  );
}

/* ─── Insights ─── */
function InsightCard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 border border-border/30">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/* ─── Main Component ─── */
export function CampaignAnalyticsSection() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>("todos");
  const [waFilter, setWaFilter] = useState<WhatsAppEngagementFilter>("todos");
  const [timelineInterval, setTimelineInterval] = useState("1 day");

  const { data: campaigns } = useOrbitCampaigns({});

  const sentCampaigns = (campaigns || []).filter(
    (c) => ["enviando", "concluida", "pausada", "pausada_por_limite"].includes(c.status || "")
  );

  // Determine selected campaign's canal
  const selectedCampaign = sentCampaigns.find((c) => c.id === selectedCampaignId);
  const canal = selectedCampaign?.canal || "email";
  const isWhatsApp = canal === "whatsapp";

  // Email hooks
  const { data: emailSummary, isLoading: loadingEmailSummary } = useOrbitCampaignSummary(
    !isWhatsApp ? selectedCampaignId : null
  );
  const { data: emailRecipients, isLoading: loadingEmailRecipients } = useOrbitCampaignRecipients(
    !isWhatsApp ? selectedCampaignId : null, page, PAGE_SIZE, engagementFilter
  );

  // WhatsApp hooks
  const { data: waSummary, isLoading: loadingWaSummary } = useWhatsAppCampaignSummary(
    isWhatsApp ? selectedCampaignId : null
  );
  const { data: waRecipients, isLoading: loadingWaRecipients } = useWhatsAppCampaignRecipients(
    isWhatsApp ? selectedCampaignId : null, page, PAGE_SIZE, waFilter
  );

  // Timeline (shared hook, works for both)
  const { data: timeline } = useOrbitCampaignTimeline(selectedCampaignId, timelineInterval);

  const loadingSummary = isWhatsApp ? loadingWaSummary : loadingEmailSummary;
  const loadingRecipients = isWhatsApp ? loadingWaRecipients : loadingEmailRecipients;
  const totalCount = isWhatsApp
    ? (waRecipients?.totalCount || 0)
    : (emailRecipients?.totalCount || 0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  const handleCampaignChange = (v: string) => {
    setSelectedCampaignId(v || null);
    setPage(0);
    setEngagementFilter("todos");
    setWaFilter("todos");
  };

  const handleEmailFilterChange = (v: string) => {
    setEngagementFilter(v as EngagementFilter);
    setPage(0);
  };

  const handleWaFilterChange = (v: string) => {
    setWaFilter(v as WhatsAppEngagementFilter);
    setPage(0);
  };

  // Chart data
  const chartData = (timeline || []).map((p) => ({
    ...p,
    label: format(new Date(p.bucket), timelineInterval === "1 hour" ? "HH:mm" : "dd/MM"),
  }));

  // Summary exists check
  const hasSummary = isWhatsApp ? !!waSummary : !!emailSummary;

  return (
    <div className="glass-card p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Analytics de Campanhas
        </h3>
        <Select value={selectedCampaignId || ""} onValueChange={handleCampaignChange}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Selecione uma campanha" />
          </SelectTrigger>
          <SelectContent>
            {sentCampaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  {c.canal === "whatsapp" ? (
                    <MessageCircle className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-blue-400" />
                  )}
                  {c.nome}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedCampaignId && (
        <p className="text-sm text-muted-foreground text-center py-12">
          Selecione uma campanha para ver as métricas de engajamento.
        </p>
      )}

      {selectedCampaignId && loadingSummary && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ═══════ EMAIL ANALYTICS ═══════ */}
      {hasSummary && !isWhatsApp && emailSummary && (
        <EmailAnalyticsContent
          summary={emailSummary}
          chartData={chartData}
          timelineInterval={timelineInterval}
          setTimelineInterval={setTimelineInterval}
          engagementFilter={engagementFilter}
          handleFilterChange={handleEmailFilterChange}
          loadingRecipients={loadingRecipients}
          recipients={emailRecipients?.recipients || []}
          totalCount={totalCount}
          from={from}
          to={to}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
        />
      )}

      {/* ═══════ WHATSAPP ANALYTICS ═══════ */}
      {hasSummary && isWhatsApp && waSummary && (
        <WhatsAppAnalyticsContent
          summary={waSummary}
          chartData={chartData}
          timelineInterval={timelineInterval}
          setTimelineInterval={setTimelineInterval}
          waFilter={waFilter}
          handleFilterChange={handleWaFilterChange}
          loadingRecipients={loadingRecipients}
          recipients={waRecipients?.recipients || []}
          totalCount={totalCount}
          from={from}
          to={to}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EMAIL ANALYTICS CONTENT
   ═══════════════════════════════════════════════════════ */

import type { CampaignSummary, RecipientDetail, WhatsAppCampaignSummary, WhatsAppRecipientDetail } from "@/hooks/useOrbitEmailAnalytics";

function EmailAnalyticsContent({
  summary,
  chartData,
  timelineInterval,
  setTimelineInterval,
  engagementFilter,
  handleFilterChange,
  loadingRecipients,
  recipients,
  totalCount,
  from,
  to,
  page,
  totalPages,
  setPage,
}: {
  summary: CampaignSummary;
  chartData: any[];
  timelineInterval: string;
  setTimelineInterval: (v: string) => void;
  engagementFilter: EngagementFilter;
  handleFilterChange: (v: string) => void;
  loadingRecipients: boolean;
  recipients: RecipientDetail[];
  totalCount: number;
  from: number;
  to: number;
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  // Insights
  const insights: { icon: React.ReactNode; text: string }[] = [];
  if (summary.openRate > 25) {
    insights.push({
      icon: <TrendingUp className="h-4 w-4 text-green-400" />,
      text: `Taxa de abertura de ${summary.openRate.toFixed(1)}% — acima da média de mercado (15-25%).`,
    });
  } else if (summary.openRate > 0 && summary.openRate < 10) {
    insights.push({
      icon: <TrendingDown className="h-4 w-4 text-red-400" />,
      text: `Taxa de abertura de ${summary.openRate.toFixed(1)}% — abaixo da média. Considere revisar o assunto do email.`,
    });
  }
  if (summary.noInteraction > 0) {
    insights.push({
      icon: <Lightbulb className="h-4 w-4 text-amber-400" />,
      text: `${summary.noInteraction} leads sem interação — considere reenviar com outro assunto.`,
    });
  }
  if (summary.bounced > 0) {
    insights.push({
      icon: <ShieldAlert className="h-4 w-4 text-red-400" />,
      text: `${summary.bounced} bounces detectados (${summary.bounceRate.toFixed(1)}%). Verifique a qualidade da lista.`,
    });
  }

  return (
    <>
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard icon={<Users className="h-4 w-4" />} label="Destinatários" value={summary.totalRecipients} />
        <MetricCard icon={<Send className="h-4 w-4" />} label="Enviados" value={summary.total} />
        <MetricCard icon={<Mail className="h-4 w-4" />} label="Entregues" value={summary.delivered} />
        <MetricCard
          icon={<MailOpen className="h-4 w-4" />}
          label="Aberturas"
          value={summary.opened}
          sub={`${summary.openRate.toFixed(1)}%`}
          trend={summary.openRate > 20 ? "up" : summary.openRate < 10 && summary.openRate > 0 ? "down" : null}
        />
        <MetricCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Cliques"
          value={summary.clicked}
          sub={`${summary.clickRate.toFixed(1)}%`}
          trend={summary.clickRate > 3 ? "up" : null}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Bounces"
          value={summary.bounced}
          sub={`${summary.bounceRate.toFixed(1)}%`}
          trend={summary.bounceRate > 5 ? "down" : null}
        />
        <MetricCard icon={<ShieldAlert className="h-4 w-4" />} label="Spam" value={summary.complained} />
      </div>

      {/* Chart + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 p-4 bg-muted/30 rounded-xl border border-border/40">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold">Engajamento ao Longo do Tempo</h4>
            <Select value={timelineInterval} onValueChange={setTimelineInterval}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {intervalOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Line type="monotone" dataKey="enviados" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Enviados" />
                <Line type="monotone" dataKey="aberturas" stroke="hsl(142, 76%, 36%)" strokeWidth={2} dot={false} name="Aberturas" />
                <Line type="monotone" dataKey="cliques" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} name="Cliques" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-16">Sem dados temporais disponíveis.</p>
          )}
        </div>

        <div className="lg:col-span-2 p-4 bg-muted/30 rounded-xl border border-border/40">
          <h4 className="text-sm font-semibold mb-4">Funil de Conversão</h4>
          <div className="space-y-2.5">
            <FunnelStep label="Enviados" value={summary.total} maxValue={summary.total} color="hsl(var(--primary))" />
            <FunnelStep label="Entregues" value={summary.delivered} maxValue={summary.total} rate={summary.total > 0 ? `${((summary.delivered / summary.total) * 100).toFixed(0)}%` : "—"} color="hsl(210, 80%, 55%)" />
            <FunnelStep label="Abertos" value={summary.opened} maxValue={summary.total} rate={summary.delivered > 0 ? `${((summary.opened / summary.delivered) * 100).toFixed(0)}%` : "—"} color="hsl(142, 76%, 36%)" />
            <FunnelStep label="Clicados" value={summary.clicked} maxValue={summary.total} rate={summary.opened > 0 ? `${((summary.clicked / summary.opened) * 100).toFixed(0)}%` : "—"} color="hsl(38, 92%, 50%)" />
          </div>
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Insights
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {insights.map((ins, i) => <InsightCard key={i} icon={ins.icon} text={ins.text} />)}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled className="opacity-50">
          <Send className="h-3.5 w-3.5 mr-1.5" /> Reenviar para não abertos
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-50">
          <Users className="h-3.5 w-3.5 mr-1.5" /> Exportar engajados
        </Button>
      </div>

      {/* Tracking Note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-500">
          Taxas de abertura podem ser imprecisas — alguns clientes de email bloqueiam imagens de tracking.
          "Sem interação" não significa necessariamente spam.
        </p>
      </div>

      {/* Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Destinatários</h4>
          <Select value={engagementFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {emailFilterOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadingRecipients ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Evento</TableHead>
                  <TableHead>Entregue</TableHead>
                  <TableHead>Aberto</TableHead>
                  <TableHead>Clicado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => {
                  const badge = engagementBadge[r.engagement_status || "pending"] || engagementBadge.pending;
                  const events = [
                    r.clicked_at && { label: "Clicou", at: r.clicked_at },
                    r.opened_at && { label: "Abriu", at: r.opened_at },
                    r.bounced_at && { label: "Bounce", at: r.bounced_at },
                    r.complained_at && { label: "Spam", at: r.complained_at },
                    r.delivered_at && { label: "Entregue", at: r.delivered_at },
                    r.enviado_em && { label: "Enviado", at: r.enviado_em },
                  ].filter(Boolean) as { label: string; at: string }[];
                  const lastEvent = events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];

                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{r.prospect_name || r.email || "-"}</p>
                          {r.email && r.prospect_name && <p className="text-xs text-muted-foreground">{r.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {lastEvent ? (
                          <span>{lastEvent.label} <span className="text-muted-foreground">{format(new Date(lastEvent.at), "dd/MM HH:mm")}</span></span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{r.delivered_at ? format(new Date(r.delivered_at), "dd/MM HH:mm") : "-"}</TableCell>
                      <TableCell className="text-xs">{r.opened_at ? format(new Date(r.opened_at), "dd/MM HH:mm") : "-"}</TableCell>
                      <TableCell className="text-xs">{r.clicked_at ? format(new Date(r.clicked_at), "dd/MM HH:mm") : "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationControls from={from} to={to} totalCount={totalCount} page={page} totalPages={totalPages} setPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   WHATSAPP ANALYTICS CONTENT
   ═══════════════════════════════════════════════════════ */

function WhatsAppAnalyticsContent({
  summary,
  chartData,
  timelineInterval,
  setTimelineInterval,
  waFilter,
  handleFilterChange,
  loadingRecipients,
  recipients,
  totalCount,
  from,
  to,
  page,
  totalPages,
  setPage,
}: {
  summary: WhatsAppCampaignSummary;
  chartData: any[];
  timelineInterval: string;
  setTimelineInterval: (v: string) => void;
  waFilter: WhatsAppEngagementFilter;
  handleFilterChange: (v: string) => void;
  loadingRecipients: boolean;
  recipients: WhatsAppRecipientDetail[];
  totalCount: number;
  from: number;
  to: number;
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  // Insights
  const insights: { icon: React.ReactNode; text: string }[] = [];
  if (summary.readRate > 70) {
    insights.push({
      icon: <TrendingUp className="h-4 w-4 text-green-400" />,
      text: `Taxa de leitura de ${summary.readRate.toFixed(1)}% — excelente para WhatsApp.`,
    });
  } else if (summary.readRate > 0 && summary.readRate < 30) {
    insights.push({
      icon: <TrendingDown className="h-4 w-4 text-red-400" />,
      text: `Taxa de leitura de ${summary.readRate.toFixed(1)}% — abaixo do esperado. Verifique horário de envio.`,
    });
  }
  const noResponse = summary.delivered - summary.replied;
  if (noResponse > 0) {
    insights.push({
      icon: <Lightbulb className="h-4 w-4 text-amber-400" />,
      text: `${noResponse} leads sem resposta — considere follow-up.`,
    });
  }
  if (summary.failed > 0) {
    insights.push({
      icon: <ShieldAlert className="h-4 w-4 text-red-400" />,
      text: `${summary.failed} falhas detectadas — verifique os números de WhatsApp.`,
    });
  }

  return (
    <>
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard icon={<Users className="h-4 w-4" />} label="Destinatários" value={summary.totalRecipients} />
        <MetricCard icon={<Send className="h-4 w-4" />} label="Enviados" value={summary.total} />
        <MetricCard icon={<CheckCheck className="h-4 w-4" />} label="Entregues" value={summary.delivered} />
        <MetricCard
          icon={<Eye className="h-4 w-4" />}
          label="Lidos"
          value={summary.read}
          sub={`${summary.readRate.toFixed(1)}%`}
          trend={summary.readRate > 60 ? "up" : summary.readRate < 20 && summary.readRate > 0 ? "down" : null}
        />
        <MetricCard
          icon={<Reply className="h-4 w-4" />}
          label="Respondidos"
          value={summary.replied}
          sub={`${summary.replyRate.toFixed(1)}%`}
          trend={summary.replyRate > 10 ? "up" : null}
        />
        <MetricCard
          icon={<XCircle className="h-4 w-4" />}
          label="Falhas"
          value={summary.failed}
          trend={summary.failed > 0 ? "down" : null}
        />
        <MetricCard icon={<Clock className="h-4 w-4" />} label="Pendentes" value={summary.pending} />
      </div>

      {/* Chart + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 p-4 bg-muted/30 rounded-xl border border-border/40">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold">Engajamento ao Longo do Tempo</h4>
            <Select value={timelineInterval} onValueChange={setTimelineInterval}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {intervalOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Line type="monotone" dataKey="enviados" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Enviados" />
                <Line type="monotone" dataKey="entregues" stroke="hsl(210, 80%, 55%)" strokeWidth={2} dot={false} name="Entregues" />
                <Line type="monotone" dataKey="leituras" stroke="hsl(142, 76%, 36%)" strokeWidth={2} dot={false} name="Leituras" />
                <Line type="monotone" dataKey="respostas" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} name="Respostas" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-16">Sem dados temporais disponíveis.</p>
          )}
        </div>

        <div className="lg:col-span-2 p-4 bg-muted/30 rounded-xl border border-border/40">
          <h4 className="text-sm font-semibold mb-4">Funil de Conversão</h4>
          <div className="space-y-2.5">
            <FunnelStep label="Destinatários" value={summary.totalRecipients} maxValue={summary.totalRecipients} color="hsl(var(--primary))" />
            <FunnelStep label="Enviados" value={summary.total} maxValue={summary.totalRecipients} rate={summary.totalRecipients > 0 ? `${((summary.total / summary.totalRecipients) * 100).toFixed(0)}%` : "—"} color="hsl(210, 80%, 55%)" />
            <FunnelStep label="Entregues" value={summary.delivered} maxValue={summary.totalRecipients} rate={summary.total > 0 ? `${((summary.delivered / summary.total) * 100).toFixed(0)}%` : "—"} color="hsl(180, 60%, 45%)" />
            <FunnelStep label="Lidos" value={summary.read} maxValue={summary.totalRecipients} rate={summary.delivered > 0 ? `${((summary.read / summary.delivered) * 100).toFixed(0)}%` : "—"} color="hsl(142, 76%, 36%)" />
            <FunnelStep label="Responderam" value={summary.replied} maxValue={summary.totalRecipients} rate={summary.read > 0 ? `${((summary.replied / summary.read) * 100).toFixed(0)}%` : "—"} color="hsl(38, 92%, 50%)" />
          </div>
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Insights
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {insights.map((ins, i) => <InsightCard key={i} icon={ins.icon} text={ins.text} />)}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled className="opacity-50">
          <Send className="h-3.5 w-3.5 mr-1.5" /> Reenviar para sem resposta
        </Button>
        <Button variant="outline" size="sm" disabled className="opacity-50">
          <Users className="h-3.5 w-3.5 mr-1.5" /> Exportar engajados
        </Button>
      </div>

      {/* WhatsApp Note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <MessageCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
        <p className="text-xs text-green-500">
          Status de leitura depende das configurações de privacidade do destinatário.
          Nem todos os "lidos" serão registrados.
        </p>
      </div>

      {/* Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Destinatários</h4>
          <Select value={waFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {whatsappFilterOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadingRecipients ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Entregue</TableHead>
                  <TableHead>Lido</TableHead>
                  <TableHead>Respondeu</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => {
                  const badge = whatsappStatusBadge[r.status || "pendente"] || whatsappStatusBadge.pendente;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{r.prospect_name || "-"}</p>
                          {r.prospect_empresa && <p className="text-xs text-muted-foreground">{r.prospect_empresa}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.telefone || "-"}</TableCell>
                      <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                      <TableCell className="text-xs">{r.enviado_em ? format(new Date(r.enviado_em), "dd/MM HH:mm") : "-"}</TableCell>
                      <TableCell className="text-xs">{r.delivered_at ? format(new Date(r.delivered_at), "dd/MM HH:mm") : "-"}</TableCell>
                      <TableCell className="text-xs">{r.read_at ? format(new Date(r.read_at), "dd/MM HH:mm") : "-"}</TableCell>
                      <TableCell className="text-xs">{r.replied_at ? format(new Date(r.replied_at), "dd/MM HH:mm") : "-"}</TableCell>
                      <TableCell className="text-xs text-red-400 max-w-[150px] truncate">{r.erro || "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationControls from={from} to={to} totalCount={totalCount} page={page} totalPages={totalPages} setPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}

/* ─── Shared Pagination Controls ─── */
function PaginationControls({
  from, to, totalCount, page, totalPages, setPage,
}: {
  from: number;
  to: number;
  totalCount: number;
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  if (totalCount <= 0) return null;
  return (
    <div className="flex items-center justify-between pt-3">
      <p className="text-sm text-muted-foreground">
        Mostrando {from}–{to} de {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
          Próxima <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
