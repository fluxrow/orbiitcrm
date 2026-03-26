import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Mail, MailOpen, MousePointerClick, AlertTriangle, Info, Loader2,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Lightbulb,
  Send, Users, ShieldAlert, BarChart3, Filter,
} from "lucide-react";
import { useOrbitCampaigns } from "@/hooks/useOrbitCampaigns";
import {
  useOrbitCampaignSummary,
  useOrbitCampaignRecipients,
  useOrbitCampaignTimeline,
  type EngagementFilter,
} from "@/hooks/useOrbitEmailAnalytics";
import { format } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

const PAGE_SIZE = 50;

const engagementBadge: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  delivered: { label: "Entregue", className: "bg-blue-500/20 text-blue-400" },
  engaged: { label: "Engajado", className: "bg-green-500/20 text-green-400" },
  bounced: { label: "Bounce", className: "bg-red-500/20 text-red-400" },
  complained: { label: "Spam", className: "bg-orange-500/20 text-orange-400" },
  no_interaction: { label: "Sem Interação", className: "bg-amber-500/20 text-amber-500" },
};

const filterOptions: { value: EngagementFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "abriu", label: "Abriu" },
  { value: "nao_abriu", label: "Não Abriu" },
  { value: "clicou", label: "Clicou" },
  { value: "nao_clicou", label: "Não Clicou" },
  { value: "falhou", label: "Falhou (Bounce/Spam)" },
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
  const [timelineInterval, setTimelineInterval] = useState("1 day");

  const { data: campaigns } = useOrbitCampaigns({});
  const { data: summary, isLoading: loadingSummary } = useOrbitCampaignSummary(selectedCampaignId);
  const { data: recipientsData, isLoading: loadingRecipients } = useOrbitCampaignRecipients(
    selectedCampaignId, page, PAGE_SIZE, engagementFilter
  );
  const { data: timeline } = useOrbitCampaignTimeline(selectedCampaignId, timelineInterval);

  const sentCampaigns = (campaigns || []).filter(
    (c) => ["enviando", "concluida", "pausada", "pausada_por_limite"].includes(c.status || "")
  );

  const totalCount = recipientsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  const handleCampaignChange = (v: string) => {
    setSelectedCampaignId(v || null);
    setPage(0);
    setEngagementFilter("todos");
  };

  const handleFilterChange = (v: string) => {
    setEngagementFilter(v as EngagementFilter);
    setPage(0);
  };

  // Chart data formatted
  const chartData = (timeline || []).map((p) => ({
    ...p,
    label: format(new Date(p.bucket), timelineInterval === "1 hour" ? "HH:mm" : "dd/MM"),
  }));

  // Generate insights from summary
  const insights: { icon: React.ReactNode; text: string }[] = [];
  if (summary) {
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
  }

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
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
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

      {summary && (
        <>
          {/* ─── A. Metric Cards ─── */}
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

          {/* ─── B. Timeline Chart + Funnel ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Chart */}
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
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Line type="monotone" dataKey="enviados" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Enviados" />
                    <Line type="monotone" dataKey="aberturas" stroke="hsl(142, 76%, 36%)" strokeWidth={2} dot={false} name="Aberturas" />
                    <Line type="monotone" dataKey="cliques" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} name="Cliques" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-16">
                  Sem dados temporais disponíveis para esta campanha.
                </p>
              )}
            </div>

            {/* Funnel */}
            <div className="lg:col-span-2 p-4 bg-muted/30 rounded-xl border border-border/40">
              <h4 className="text-sm font-semibold mb-4">Funil de Conversão</h4>
              <div className="space-y-2.5">
                <FunnelStep label="Enviados" value={summary.total} maxValue={summary.total} color="hsl(var(--primary))" />
                <FunnelStep
                  label="Entregues"
                  value={summary.delivered}
                  maxValue={summary.total}
                  rate={summary.total > 0 ? `${((summary.delivered / summary.total) * 100).toFixed(0)}%` : "—"}
                  color="hsl(210, 80%, 55%)"
                />
                <FunnelStep
                  label="Abertos"
                  value={summary.opened}
                  maxValue={summary.total}
                  rate={summary.delivered > 0 ? `${((summary.opened / summary.delivered) * 100).toFixed(0)}%` : "—"}
                  color="hsl(142, 76%, 36%)"
                />
                <FunnelStep
                  label="Clicados"
                  value={summary.clicked}
                  maxValue={summary.total}
                  rate={summary.opened > 0 ? `${((summary.clicked / summary.opened) * 100).toFixed(0)}%` : "—"}
                  color="hsl(38, 92%, 50%)"
                />
              </div>
            </div>
          </div>

          {/* ─── E. Insights ─── */}
          {insights.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Lightbulb className="h-4 w-4 text-amber-400" /> Insights
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {insights.map((ins, i) => (
                  <InsightCard key={i} icon={ins.icon} text={ins.text} />
                ))}
              </div>
            </div>
          )}

          {/* ─── F. Quick Actions ─── */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled className="opacity-50">
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Reenviar para não abertos
            </Button>
            <Button variant="outline" size="sm" disabled className="opacity-50">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Exportar engajados
            </Button>
          </div>

          {/* ─── Tracking Note ─── */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-500">
              Taxas de abertura podem ser imprecisas — alguns clientes de email bloqueiam imagens de tracking.
              "Sem interação" não significa necessariamente spam.
            </p>
          </div>

          {/* ─── D. Advanced Recipients Table ─── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Destinatários</h4>
              <Select value={engagementFilter} onValueChange={handleFilterChange}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loadingRecipients ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
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
                    {(recipientsData?.recipients || []).map((r) => {
                      const badge = engagementBadge[r.engagement_status || "pending"] || engagementBadge.pending;
                      // Determine last event
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
                              {r.email && r.prospect_name && (
                                <p className="text-xs text-muted-foreground">{r.email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={badge.className}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {lastEvent ? (
                              <span>
                                {lastEvent.label}{" "}
                                <span className="text-muted-foreground">
                                  {format(new Date(lastEvent.at), "dd/MM HH:mm")}
                                </span>
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.delivered_at ? format(new Date(r.delivered_at), "dd/MM HH:mm") : "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.opened_at ? format(new Date(r.opened_at), "dd/MM HH:mm") : "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.clicked_at ? format(new Date(r.clicked_at), "dd/MM HH:mm") : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {totalCount > 0 && (
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
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
