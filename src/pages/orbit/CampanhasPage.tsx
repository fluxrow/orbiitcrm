import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MessageSquare, Mail, Loader2 } from "lucide-react";
import { useOrbitCampaigns } from "@/hooks/useOrbitCampaigns";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  agendada: { label: "Agendada", className: "bg-blue-500/20 text-blue-400" },
  em_andamento: { label: "Em Andamento", className: "bg-green-500/20 text-green-400" },
};

export default function CampanhasPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: campaigns, isLoading } = useOrbitCampaigns({ status: statusFilter });

  return (
    <OrbitLayout>
      <PageHeader title="Campanhas" description="Gerencie campanhas de email e WhatsApp" action={<Button size="sm"><Plus className="h-4 w-4 mr-2" />Nova Campanha</Button>} />
      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="rascunho">Rascunho</SelectItem><SelectItem value="em_andamento">Em Andamento</SelectItem></SelectContent></Select>
      </div>
      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div> : campaigns?.length === 0 ? <div className="text-center py-12 text-muted-foreground">Nenhuma campanha</div> : (
        <div className="space-y-4">
          {campaigns?.map((c) => (
            <div key={c.id} className="bg-card border rounded-lg p-6">
              <div className="flex justify-between mb-4">
                <div className="flex gap-3"><div className={`p-2 rounded-lg ${c.canal === "whatsapp" ? "bg-green-500/20" : "bg-blue-500/20"}`}>{c.canal === "whatsapp" ? <MessageSquare className="h-5 w-5 text-green-500" /> : <Mail className="h-5 w-5 text-blue-500" />}</div><div><h3 className="font-semibold">{c.nome}</h3><p className="text-sm text-muted-foreground">Criada em {c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "-"}</p></div></div>
                <Badge className={statusConfig[c.status || "rascunho"]?.className}>{statusConfig[c.status || "rascunho"]?.label}</Badge>
              </div>
              <div className="grid grid-cols-5 gap-4">{[["Destinatários", c.total_destinatarios], ["Enviados", c.enviados], ["Aberturas", c.aberturas], ["Cliques", c.cliques], ["Respostas", c.respostas]].map(([l, v]) => <div key={String(l)} className="p-3 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold">{v || 0}</p></div>)}</div>
            </div>
          ))}
        </div>
      )}
    </OrbitLayout>
  );
}
