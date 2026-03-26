import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, MailOpen, MousePointerClick, AlertTriangle, Info, Loader2 } from "lucide-react";
import { useOrbitCampaigns } from "@/hooks/useOrbitCampaigns";
import { useOrbitEmailAnalytics } from "@/hooks/useOrbitEmailAnalytics";
import { format } from "date-fns";

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
  const { data: campaigns } = useOrbitCampaigns({ canal: "email" });
  const { data, isLoading } = useOrbitEmailAnalytics(selectedCampaignId);

  const emailCampaigns = (campaigns || []).filter(
    (c) => ["enviando", "concluida", "pausada"].includes(c.status || "")
  );

  return (
    <div className="glass-card p-5 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">📧 Analytics de Campanhas de Email</h3>
        <Select
          value={selectedCampaignId || ""}
          onValueChange={(v) => setSelectedCampaignId(v || null)}
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

      {selectedCampaignId && isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard icon={<Mail className="h-4 w-4" />} label="Enviados" value={data.total} />
            <MetricCard icon={<Mail className="h-4 w-4" />} label="Entregues" value={data.delivered} />
            <MetricCard icon={<MailOpen className="h-4 w-4" />} label="Aberturas" value={data.opened} sub={`${data.openRate.toFixed(1)}%`} />
            <MetricCard icon={<MousePointerClick className="h-4 w-4" />} label="Cliques" value={data.clicked} sub={`${data.clickRate.toFixed(1)}%`} />
            <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Bounces" value={data.bounced} sub={`${data.bounceRate.toFixed(1)}%`} />
            <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Spam" value={data.complained} />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-500">
              Taxas de abertura podem ser imprecisas — alguns clientes de email bloqueiam imagens de tracking.
              "Sem interação" não significa necessariamente spam.
            </p>
          </div>

          {/* Recipients table */}
          <ScrollArea className="max-h-[400px]">
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
                {data.recipients.map((r) => {
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
          </ScrollArea>
        </>
      )}
    </div>
  );
}
