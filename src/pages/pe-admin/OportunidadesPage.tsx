import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOportunidades } from "@/hooks/useOportunidades";
import { useFunilEtapas } from "@/hooks/useFunilEtapas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, LayoutGrid, Eye } from "lucide-react";
import { OportunidadeDialog } from "@/components/pe-admin/OportunidadeDialog";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  open: "default", won: "secondary", lost: "destructive",
};

export default function OportunidadesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [etapaFilter, setEtapaFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: oportunidades, isLoading } = useOportunidades({
    search: search || undefined,
    status: statusFilter || undefined,
    etapa_id: etapaFilter || undefined,
  });
  const { data: etapas } = useFunilEtapas();

  const formatCurrency = (v: number | null) =>
    v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Oportunidades</h1>
          <p className="text-muted-foreground">Gerencie pacotes e viagens corporativas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/pe-admin/oportunidades/kanban")}>
            <LayoutGrid className="w-4 h-4 mr-2" />Kanban
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />Nova Oportunidade
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por título..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={etapaFilter} onValueChange={(v) => setEtapaFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {(etapas || []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(oportunidades || []).map((o: any) => (
                <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pe-admin/oportunidades/${o.id}`)}>
                  <TableCell className="font-medium">{o.titulo}</TableCell>
                  <TableCell>{o.clientes?.nome_fantasia || o.clientes?.razao_social || "—"}</TableCell>
                  <TableCell>{o.destino || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{o.funil_etapas?.nome || "—"}</Badge></TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[o.status] || "default"}>{o.status}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(o.valor_total_estimado)}</TableCell>
                  <TableCell>{(o.owner as any)?.full_name || "—"}</TableCell>
                  <TableCell><Eye className="w-4 h-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
              {(!oportunidades || oportunidades.length === 0) && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma oportunidade encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <OportunidadeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
