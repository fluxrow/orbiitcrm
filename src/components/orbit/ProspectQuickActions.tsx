import { useState } from "react";
import { Bot, BotOff, MoveRight, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { usePipelineStages } from "@/hooks/useOrbitPipelineConfig";
import { useOrbitFlows } from "@/hooks/useOrbitFlows";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  prospect: any;
}

/**
 * F4 — Ações rápidas no card do prospect:
 *  - Toggle IA  → flip human_talk na conversa aberta
 *  - Mover etapa → ensure_deal_for_prospect + update etapa_id
 *  - Forçar fluxo → insert manual_trigger em orbit_flow_events
 */
export function ProspectQuickActions({ prospect }: Props) {
  const qc = useQueryClient();
  const empresaId: string | undefined = prospect.empresa_id;
  const { data: stages } = usePipelineStages();
  const { data: flows } = useOrbitFlows(empresaId);

  const [busy, setBusy] = useState<null | "ia" | "stage" | "flow">(null);
  const [stageOpen, setStageOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);

  async function toggleIA(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy("ia");
    try {
      const { data: conv, error } = await supabase
        .from("orbit_conversas")
        .select("id, human_talk")
        .eq("prospect_id", prospect.id)
        .eq("status", "aberta")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!conv) {
        toast.info("Nenhuma conversa aberta para este prospect.");
        return;
      }
      const next = !conv.human_talk;
      const { error: upErr } = await supabase
        .from("orbit_conversas")
        .update({ human_talk: next })
        .eq("id", conv.id);
      if (upErr) throw upErr;
      toast.success(next ? "IA pausada — controle humano" : "IA reativada");
      qc.invalidateQueries({ queryKey: ["orbit-conversas"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function moveStage(stageId: string) {
    setStageOpen(false);
    setBusy("stage");
    try {
      const { data: dealId, error: rpcErr } = await supabase.rpc(
        "ensure_deal_for_prospect" as any,
        { _prospect_id: prospect.id },
      );
      if (rpcErr) throw rpcErr;
      if (!dealId) throw new Error("Falha ao criar deal");
      const { error: upErr } = await supabase
        .from("orbit_deals")
        .update({ etapa_id: stageId, moved_at: new Date().toISOString() } as any)
        .eq("id", dealId as unknown as string);
      if (upErr) throw upErr;
      toast.success("Deal movido de etapa");
      qc.invalidateQueries({ queryKey: ["orbit_deals"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function forceFlow(flowId: string, triggerType: string) {
    setFlowOpen(false);
    if (!empresaId) return;
    setBusy("flow");
    try {
      const eventId = crypto.randomUUID();
      const { error } = await (supabase.from("orbit_flow_events" as any) as any).insert({
        empresa_id: empresaId,
        event_type: triggerType,
        entity_type: "prospect",
        entity_id: prospect.id,
        payload: {
          manual_trigger: true,
          forced_flow_id: flowId,
          triggered_at: new Date().toISOString(),
        },
        dedupe_key: `manual_trigger:${flowId}:${prospect.id}:${eventId}`,
      });
      if (error) throw error;
      try {
        await supabase.functions.invoke("orbit-flow-dispatcher", {
          body: { trigger: "manual", event_type: triggerType, forced_flow_id: flowId },
        });
      } catch {
        /* cron pega em seguida */
      }
      toast.success("Fluxo disparado manualmente");
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  const activeFlows = (flows ?? []).filter((f) => f.ativo);

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {/* Toggle IA */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 hover:text-brand"
            onClick={toggleIA}
            disabled={busy === "ia"}
            data-testid="toggle-ai-action"
          >
            {busy === "ia" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bot className="w-3.5 h-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Pausar/retomar IA na conversa</TooltipContent>
      </Tooltip>

      {/* Mover etapa */}
      <Popover open={stageOpen} onOpenChange={setStageOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 hover:text-brand"
                disabled={busy === "stage"}
                data-testid="move-stage-action"
              >
                {busy === "stage" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MoveRight className="w-3.5 h-3.5" />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Mover deal para etapa</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-56 p-2" align="end">
          <div className="text-[11px] text-muted-foreground mb-1 px-1">
            Mover para etapa
          </div>
          <Select onValueChange={moveStage}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Escolher etapa..." />
            </SelectTrigger>
            <SelectContent>
              {(stages ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
              {(!stages || stages.length === 0) && (
                <div className="p-2 text-xs text-muted-foreground">
                  Nenhuma etapa configurada
                </div>
              )}
            </SelectContent>
          </Select>
        </PopoverContent>
      </Popover>

      {/* Forçar fluxo */}
      <Popover open={flowOpen} onOpenChange={setFlowOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 hover:text-brand"
                disabled={busy === "flow"}
              >
                {busy === "flow" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Forçar disparo de fluxo</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-64 p-2" align="end">
          <div className="text-[11px] text-muted-foreground mb-1 px-1">
            Forçar fluxo (manual_trigger)
          </div>
          {activeFlows.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">
              Nenhum fluxo ativo nesta empresa.
            </div>
          ) : (
            <div className="flex flex-col">
              {activeFlows.map((f) => (
                <button
                  key={f.id}
                  className="text-left text-sm px-2 py-1.5 rounded hover:bg-brand/10 hover:text-brand transition"
                  onClick={() => forceFlow(f.id, f.trigger_type)}
                >
                  {f.nome}
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
