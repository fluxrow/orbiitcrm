import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { DealDialog } from "@/components/orbit/DealDialog";
import { DealCard } from "@/components/orbit/DealCard";
import { OrbitTaskDialog } from "@/components/orbit/OrbitTaskDialog";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useOrbitDealsGrouped, useMoveDealToStage, useConvertDealToClient } from "@/hooks/useOrbitDeals";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export default function FunilPage() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Tables<"orbit_deals"> | null>(null);
  const [defaultEtapaId, setDefaultEtapaId] = useState<string>();
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDefaultProspectId, setTaskDefaultProspectId] = useState<string>();

  const { data: dealsGrouped, isLoading } = useOrbitDealsGrouped();
  const moveDeal = useMoveDealToStage();
  const convertDeal = useConvertDealToClient();
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();

  // H2.b — Realtime: refletir mudanças em orbit_deals sem precisar dar F5
  useEffect(() => {
    if (!empresaId) return;
    const channel = supabase
      .channel(`funil-deals-${empresaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orbit_deals", filter: `empresa_id=eq.${empresaId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["orbit-deals-grouped"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [empresaId, queryClient]);

  const formatCurrency = (v: number | null) =>
    v
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v)
      : "R$ 0";

  const totalPipeline = dealsGrouped
    ? dealsGrouped.reduce((s, stage) => s + (stage.total || 0), 0)
    : 0;

  const handleDrop = async (e: React.DragEvent, etapaId: string) => {
    e.preventDefault();
    if (!draggedDeal) return;

    const targetStage = dealsGrouped?.find((s) => s.id === etapaId);
    const dealData = dealsGrouped
      ?.flatMap((s) => s.deals || [])
      .find((d) => d.id === draggedDeal);

    if (targetStage?.is_won && dealData?.prospect_id) {
      try {
        await convertDeal.mutateAsync({
          deal_id: draggedDeal,
          prospect_id: dealData.prospect_id,
          etapa_id: etapaId,
        });
        toast.success("Prospect convertido em cliente!");
      } catch {
        toast.error("Erro ao converter");
      }
    } else {
      try {
        await moveDeal.mutateAsync({ deal_id: draggedDeal, etapa_id: etapaId });
        toast.success("Movido!");
      } catch {
        toast.error("Erro ao mover");
      }
    }
    setDraggedDeal(null);
  };

  if (isLoading) {
    return (
      <OrbitLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </OrbitLayout>
    );
  }

  return (
    <OrbitLayout>
      <TooltipProvider>
        <PageHeader
          title="Funil de Vendas"
          description="Gerencie suas oportunidades comerciais"
          action={
            <Button
              size="sm"
              onClick={() => {
                setSelectedDeal(null);
                setDefaultEtapaId(undefined);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Oportunidade
            </Button>
          }
        />

        {/* Pipeline total */}
        <div className="mb-6 p-4 bg-card border rounded-lg">
          <p className="text-sm text-muted-foreground">Total Pipeline</p>
          <p className="text-2xl font-bold">{formatCurrency(totalPipeline)}</p>
        </div>

        {dealsGrouped && dealsGrouped.length > 0 && totalPipeline === 0 &&
          dealsGrouped.every((s) => (s.deals || []).length === 0) && (
            <div className="mb-4 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 text-sm text-muted-foreground">
              Nenhum lead no funil ainda. Os cards aparecem aqui automaticamente
              quando o agente qualifica um lead pelo WhatsApp, ou clique em{" "}
              <span className="font-medium text-foreground">Nova Oportunidade</span> para adicionar manualmente.
            </div>
          )}

        {/* Kanban columns */}
        <div
          className="flex gap-4 overflow-x-auto overscroll-x-contain pb-4"
          style={{ overscrollBehaviorX: "contain" }}
        >
          {dealsGrouped?.map((stage) => {
            const stageDeals = stage.deals || [];
            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-80 bg-muted/30 rounded-lg"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Column header */}
                <div
                  className="p-4 border-b rounded-t-lg"
                  style={{ borderTopColor: stage.cor || "#3b82f6", borderTopWidth: 3 }}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{stage.nome}</h3>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                        {stageDeals.length}
                      </span>
                    </div>
                    {stage.total > 0 && (
                      <span className="text-xs font-medium text-primary">
                        {formatCurrency(stage.total)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2 min-h-[200px]">
                  {stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      stageName={stage.nome}
                      isWonStage={!!stage.is_won}
                      isDragging={draggedDeal === deal.id}
                      onDragStart={() => setDraggedDeal(deal.id)}
                      onEdit={() => {
                        setSelectedDeal(deal);
                        setDefaultEtapaId(deal.etapa_id || undefined);
                        setDialogOpen(true);
                      }}
                      onCreateTask={() => {
                        setTaskDefaultProspectId(deal.prospect_id || undefined);
                        setTaskDialogOpen(true);
                      }}
                      onOpenProspect={() => {
                        if (deal.prospect_id) {
                          navigate(`/orbit/prospects?id=${deal.prospect_id}`);
                        }
                      }}
                      onStartConversation={() => {
                        if (deal.prospect?.whatsapp || deal.prospect?.telefone) {
                          navigate("/orbit/conversas");
                        }
                      }}
                    />
                  ))}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSelectedDeal(null);
                      setDefaultEtapaId(stage.id);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DealDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          deal={selectedDeal}
          defaultEtapaId={defaultEtapaId}
        />

        <OrbitTaskDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          defaultProspectId={taskDefaultProspectId}
        />
      </TooltipProvider>
    </OrbitLayout>
  );
}
