import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { DealDialog } from "@/components/orbit/DealDialog";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, GripVertical } from "lucide-react";
import { useOrbitDealsGrouped, useMoveDealToStage } from "@/hooks/useOrbitDeals";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export default function FunilPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Tables<"orbit_deals"> | null>(null);
  const [defaultEtapaId, setDefaultEtapaId] = useState<string>();
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);

  const { data: dealsGrouped, isLoading } = useOrbitDealsGrouped();
  const moveDeal = useMoveDealToStage();

  const formatCurrency = (v: number | null) => v ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v) : "R$ 0";
  const totalPipeline = dealsGrouped ? dealsGrouped.reduce((s, stage) => s + (stage.total || 0), 0) : 0;

  const handleDrop = async (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    if (draggedDeal) {
      try { await moveDeal.mutateAsync({ deal_id: draggedDeal, etapa_id: etapaId }); toast.success("Movido!"); } catch { toast.error("Erro"); }
    }
    setDraggedDeal(null);
  };

  if (isLoading) return <OrbitLayout><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></OrbitLayout>;

  return (
    <OrbitLayout>
      <PageHeader title="Funil de Vendas" description="Gerencie suas oportunidades" action={<Button size="sm" onClick={() => { setSelectedDeal(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova Oportunidade</Button>} />
      <div className="mb-6 p-4 bg-card border rounded-lg"><p className="text-sm text-muted-foreground">Total Pipeline</p><p className="text-2xl font-bold">{formatCurrency(totalPipeline)}</p></div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {dealsGrouped?.map((stage) => {
          const stageDeals = stage.deals || [];
          return (
            <div key={stage.id} className="flex-shrink-0 w-80 bg-muted/30 rounded-lg" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, stage.id)}>
              <div className="p-4 border-b" style={{ borderTopColor: stage.cor || "#3b82f6", borderTopWidth: 3 }}>
                <div className="flex justify-between"><h3 className="font-semibold">{stage.nome}</h3><span className="text-xs bg-muted px-2 py-1 rounded-full">{stageDeals.length}</span></div>
              </div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {stageDeals.map((deal) => (
                  <div key={deal.id} draggable onDragStart={() => setDraggedDeal(deal.id)} onClick={() => { setSelectedDeal(deal); setDefaultEtapaId(deal.etapa_id || undefined); setDialogOpen(true); }} className={`bg-card border rounded-lg p-3 cursor-grab hover:border-primary/50 ${draggedDeal === deal.id ? "opacity-50" : ""}`}>
                    <div className="flex gap-2"><GripVertical className="h-4 w-4 text-muted-foreground mt-1" /><div className="flex-1"><h4 className="font-medium truncate">{deal.titulo}</h4><span className="text-sm text-primary">{formatCurrency(Number(deal.valor_estimado))}</span></div></div>
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="w-full" onClick={() => { setSelectedDeal(null); setDefaultEtapaId(stage.id); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Adicionar</Button>
              </div>
            </div>
          );
        })}
      </div>
      <DealDialog open={dialogOpen} onOpenChange={setDialogOpen} deal={selectedDeal} defaultEtapaId={defaultEtapaId} />
    </OrbitLayout>
  );
}
