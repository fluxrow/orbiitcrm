import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOportunidades, useMoveOportunidade } from "@/hooks/useOportunidades";
import { useFunilEtapas } from "@/hooks/useFunilEtapas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Eye } from "lucide-react";
import { OportunidadeDialog } from "@/components/pe-admin/OportunidadeDialog";

export default function OportunidadesKanbanPage() {
  const navigate = useNavigate();
  const { data: oportunidades } = useOportunidades();
  const { data: etapas } = useFunilEtapas();
  const moveOp = useMoveOportunidade();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const formatCurrency = (v: number | null) =>
    v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

  const handleDrop = (etapaId: string) => {
    if (draggedId) {
      moveOp.mutate({ id: draggedId, etapa_id: etapaId });
      setDraggedId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pe-admin/oportunidades")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Kanban</h1>
            <p className="text-muted-foreground">Arraste oportunidades entre etapas</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Nova</Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {(etapas || []).map((etapa: any) => {
          const items = (oportunidades || []).filter((o: any) => o.etapa_id === etapa.id);
          return (
            <div
              key={etapa.id}
              className="flex-shrink-0 w-72 bg-muted/30 rounded-lg p-3 space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(etapa.id)}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-foreground">{etapa.nome}</h3>
                <Badge variant="outline" className="text-xs">{items.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {items.map((o: any) => (
                  <Card
                    key={o.id}
                    draggable
                    onDragStart={() => setDraggedId(o.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-sm leading-tight">{o.titulo}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => navigate(`/pe-admin/oportunidades/${o.id}`)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{o.clientes?.nome_fantasia || o.clientes?.razao_social || ""}</p>
                      {o.destino && <p className="text-xs text-muted-foreground">📍 {o.destino}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-foreground">{formatCurrency(o.valor_total_estimado)}</span>
                        <span className="text-xs text-muted-foreground">{o.probabilidade}%</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <OportunidadeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
