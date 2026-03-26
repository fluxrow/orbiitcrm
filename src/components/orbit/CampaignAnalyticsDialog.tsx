import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Mail, MailOpen, MousePointerClick, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { useOrbitEmailAnalytics } from "@/hooks/useOrbitEmailAnalytics";
import { format } from "date-fns";

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

export function CampaignAnalyticsDialog({ open, onOpenChange, campaignId, campaignName }: Props) {
  const { data, isLoading } = useOrbitEmailAnalytics(open ? campaignId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Analytics: {campaignName || "Campanha"}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : data ? (
          <div className="space-y-6 overflow-hidden flex flex-col">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Mail className="h-4 w-4" />} label="Enviados" value={data.total} />
              <StatCard icon={<MailOpen className="h-4 w-4" />} label="Aberturas" value={data.opened} sub={`${data.openRate.toFixed(1)}%`} />
              <StatCard icon={<MousePointerClick className="h-4 w-4" />} label="Cliques" value={data.clicked} sub={`${data.clickRate.toFixed(1)}%`} />
              <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Bounces" value={data.bounced} sub={`${data.bounceRate.toFixed(1)}%`} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Entregues</p>
                <p className="text-lg font-semibold">{data.delivered}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Spam</p>
                <p className="text-lg font-semibold">{data.complained}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Sem Interação</p>
                <p className="text-lg font-semibold">{data.noInteraction}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-500">
                Taxas de abertura podem ser imprecisas — alguns clientes de email bloqueiam imagens de tracking (Apple Mail Privacy, Outlook). 
                "Sem interação" não significa necessariamente spam — pode ser filtro, aba promoções ou pixel bloqueado.
              </p>
            </div>

            {/* Recipients Table */}
            <ScrollArea className="flex-1 max-h-[40vh]">
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
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
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
