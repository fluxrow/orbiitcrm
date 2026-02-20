import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { ProspectDialog } from "@/components/orbit/ProspectDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Filter, Loader2 } from "lucide-react";
import { useOrbitProspects, useDeleteProspect } from "@/hooks/useOrbitProspects";
import { useOrbitPeLinks } from "@/hooks/usePromoteProspect";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os Status" },
  { value: "novo", label: "Novo" },
  { value: "em_qualificacao", label: "Em Qualificação" },
  { value: "qualificado", label: "Qualificado" },
  { value: "desqualificado", label: "Desqualificado" },
];

export default function ProspectsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Tables<"orbit_prospects"> | null>(null);

  const { data: prospects, isLoading } = useOrbitProspects({
    search: search || undefined,
    status_qualificacao: statusFilter,
  });
  const { data: peLinks } = useOrbitPeLinks();
  const deleteProspect = useDeleteProspect();

  const linkedProspectIds = new Set(peLinks?.map((l: any) => l.prospect_id) || []);

  const handleEdit = (prospect: Tables<"orbit_prospects">) => {
    setSelectedProspect(prospect);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Excluir este prospect?")) {
      try {
        await deleteProspect.mutateAsync(id);
        toast.success("Prospect excluído!");
      } catch { toast.error("Erro ao excluir"); }
    }
  };

  const getStatusColor = (status: string | null) => {
    const colors: Record<string, string> = {
      novo: "bg-blue-500/20 text-blue-400",
      em_qualificacao: "bg-yellow-500/20 text-yellow-400",
      qualificado: "bg-green-500/20 text-green-400",
      desqualificado: "bg-red-500/20 text-red-400",
    };
    return colors[status || ""] || "bg-muted text-muted-foreground";
  };

  return (
    <OrbitLayout>
      <PageHeader
        title="Prospects"
        description="Gerencie seus leads e prospects"
        action={<Button size="sm" onClick={() => { setSelectedProspect(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo Prospect</Button>}
      />

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : prospects?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhum prospect encontrado.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {prospects?.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 cursor-pointer" onClick={() => handleEdit(p)}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold truncate">{p.nome_razao}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  {linkedProspectIds.has(p.id) && (
                    <Badge variant="outline" className="text-xs border-green-500/50 text-green-400">Convertido</Badge>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(p.status_qualificacao)}`}>{p.status_qualificacao}</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                {p.email_principal && <p className="truncate">{p.email_principal}</p>}
                {p.telefone_whatsapp && <p>{p.telefone_whatsapp}</p>}
              </div>
              <div className="flex justify-between mt-3 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">{p.origem_contato}</span>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>Excluir</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ProspectDialog open={dialogOpen} onOpenChange={setDialogOpen} prospect={selectedProspect} />
    </OrbitLayout>
  );
}
