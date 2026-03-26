import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2, Mail, MailOpen, MousePointerClick, AlertTriangle, Info,
  ChevronLeft, ChevronRight, Send, Users, ShieldAlert, TrendingUp, TrendingDown, Filter,
} from "lucide-react";
import {
  useOrbitCampaignSummary,
  useOrbitCampaignRecipients,
  type EngagementFilter,
} from "@/hooks/useOrbitEmailAnalytics";
import { format } from "date-fns";

const PAGE_SIZE = 50;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  campaignName?: string;
}

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
  { value: "falhou", label: "Falhou" },
];

function MetricCard({
  icon, label, value, sub, trend,
}: {
  icon: React.ReactNode; label: string; value: number; sub?: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <div className="p-3 bg-muted/50 rounded-xl border border-border/50">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        {trend === "up" && <TrendingUp className="h-3 w-3 text-green-400" />}
        {trend === "down" && <TrendingDown className="h-3 w-3 text-red-400" />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-xl font-bold">{value}</p>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

export function CampaignAnalyticsDialog({ open, onOpenChange, campaignId, campaignName }: Props) {
  const [page, setPage] = useState(0);
  const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>("todos");
  const activeId = open ? campaignId : null;
  const { data: summary, isLoading: loadingSummary } = useOrbitCampaignSummary(activeId);
  const { data: recipientsData, isLoading: loadingRecipients } = useOrbitCampaignRecipients(
    activeId, page, PAGE_SIZE, engagementFilter
  );

  const totalCount = recipientsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  const handleOpenChange = (v: boolean) => {
    if (!v) { setPage(0); setEngagementFilter("todos"); }
    onOpenChange(v);
  };

  const handleFilterChange = (v: string) => {
    setEngagementFilter(v as EngagementFilter);
    setPage(0);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Analytics: {campaignName || "Campanha"}</DialogTitle>
        </DialogHeader>

        {loadingSummary ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : summary ? (
          <div className="space-y-5 overflow-hidden flex flex-col">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={<Send className="h-4 w-4" />} label="Enviados" value={summary.total} />
              <MetricCard
                icon={<MailOpen className="h-4 w-4" />} label="Aberturas" value={summary.opened}
                sub={`${summary.openRate.toFixed(1)}%`}
                trend={summary.openRate > 20 ? "up" : summary.openRate < 10 && summary.openRate > 0 ? "down" : null}
              />
              <MetricCard
                icon={<MousePointerClick className="h-4 w-4" />} label="Cliques" value={summary.clicked}
                sub={`${summary.clickRate.toFixed(1)}%`}
              />
              <MetricCard
                icon={<AlertTriangle className="h-4 w-4" />} label="Bounces" value={summary.bounced}
                sub={`${summary.bounceRate.toFixed(1)}%`}
                trend={summary.bounceRate > 5 ? "down" : null}
              />
            </div>

            {/* Funnel mini */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Entregues", value: summary.delivered },
                { label: "Spam", value: summary.complained },
                { label: "Sem Interação", value: summary.noInteraction },
                { label: "Destinatários", value: summary.totalRecipients },
              ].map((s) => (
                <div key={s.label} className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-500">
                Taxas de abertura podem ser imprecisas — alguns clientes de email bloqueiam imagens de tracking.
              </p>
            </div>

            {/* Table with filter */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Destinatários</h4>
              <Select value={engagementFilter} onValueChange={handleFilterChange}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <Filter className="h-3.5 w-3.5 mr-1" />
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
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Entregue</TableHead>
                      <TableHead>Aberto</TableHead>
                      <TableHead>Clicado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(recipientsData?.recipients || []).map((r) => {
                      const badge = engagementBadge[r.engagement_status || "pending"] || engagementBadge.pending;
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
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
