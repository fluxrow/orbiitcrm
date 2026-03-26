import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Mail, MailOpen, MousePointerClick, AlertTriangle, Info, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useOrbitCampaigns } from "@/hooks/useOrbitCampaigns";
import { useOrbitCampaignSummary, useOrbitCampaignRecipients } from "@/hooks/useOrbitEmailAnalytics";
import { format } from "date-fns";

const PAGE_SIZE = 50;

const engagementBadge: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  delivered: { label: "Entregue", className: "bg-blue-500/20 text-blue-400" },
  engaged: { label: "Engajado", className: "bg-green-500/20 text-green-400" },
  bounced: { label: "Bounce", className: "bg-red-500/20 text-red-400" },
  complained: { label: "Spam", className: "bg-orange-500/20 text-orange-400" },
  no_interaction: { label: "Sem Interação", className: "bg-amber-500/20 text-amber-500" },
};

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-xl font-semibold">{value}</p>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

export function CampaignAnalyticsSection() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data: campaigns } = useOrbitCampaigns({});
  const { data: summary, isLoading: loadingSummary } = useOrbitCampaignSummary(selectedCampaignId);
  const { data: recipientsData, isLoading: loadingRecipients } = useOrbitCampaignRecipients(selectedCampaignId, page, PAGE_SIZE);

  const emailCampaigns = (campaigns || []).filter(
    (c) => ["enviando", "concluida", "pausada", "pausada_por_limite"].includes(c.status || "")
  );

  const totalCount = recipientsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  const handleCampaignChange = (v: string) => {
    setSelectedCampaignId(v || null);
    setPage(0);
  };

  return (
    <div className="glass-card p-5 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">📧 Analytics de Campanhas de Email</h3>
        <Select
          value={selectedCampaignId || ""}
          onValueChange={handleCampaignChange}
        >
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Selecione uma campanha" />
          </SelectTrigger>
          <SelectContent>
            {emailCampaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedCampaignId && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Selecione uma campanha para ver as métricas de engajamento.
        </p>
      )}

      {selectedCampaignId && loadingSummary && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <MetricCard icon={<Mail className="h-4 w-4" />} label="Destinatários" value={summary.totalRecipients} />
            <MetricCard icon={<Mail className="h-4 w-4" />} label="Enviados" value={summary.total} />
            <MetricCard icon={<Mail className="h-4 w-4" />} label="Entregues" value={summary.delivered} />
            <MetricCard icon={<MailOpen className="h-4 w-4" />} label="Aberturas" value={summary.opened} sub={`${summary.openRate.toFixed(1)}%`} />
            <MetricCard icon={<MousePointerClick className="h-4 w-4" />} label="Cliques" value={summary.clicked} sub={`${summary.clickRate.toFixed(1)}%`} />
            <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Bounces" value={summary.bounced} sub={`${summary.bounceRate.toFixed(1)}%`} />
            <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Spam" value={summary.complained} />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-500">
              Taxas de abertura podem ser imprecisas — alguns clientes de email bloqueiam imagens de tracking.
              "Sem interação" não significa necessariamente spam.
            </p>
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
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {from}–{to} de {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
