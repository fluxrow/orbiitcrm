import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrbitFlows, type OrbitFlow } from "./useOrbitFlows";

export type FlowTriggerType = OrbitFlow["trigger_type"];

export const TRIGGER_CATALOG: Array<{
  type: FlowTriggerType;
  label: string;
  description: string;
  entityType: string;
}> = [
  {
    type: "prospect_qualified",
    label: "Lead qualificado",
    description: "Disparado quando o agente IA ou o usuário marca um prospect como qualificado.",
    entityType: "prospect",
  },
  {
    type: "deal_stage_changed",
    label: "Etapa do funil alterada",
    description: "Disparado quando um deal muda de etapa no funil (manual ou por automação).",
    entityType: "deal",
  },
  {
    type: "deal_idle",
    label: "Deal parado",
    description: "Disparado quando um deal não tem movimento há N dias (configurável por fluxo).",
    entityType: "deal",
  },
  {
    type: "conversa_no_reply",
    label: "Conversa sem resposta",
    description: "Disparado quando o cliente não responde uma conversa por N horas.",
    entityType: "conversa",
  },
];

export type EventMapEntry = {
  type: FlowTriggerType;
  label: string;
  description: string;
  entityType: string;
  flows: OrbitFlow[];
};

export function useFlowEventMap(empresaId: string | null | undefined) {
  const flowsQuery = useOrbitFlows(empresaId);
  const map = useMemo<EventMapEntry[]>(() => {
    const byType = new Map<FlowTriggerType, OrbitFlow[]>();
    for (const f of flowsQuery.data ?? []) {
      const list = byType.get(f.trigger_type) ?? [];
      list.push(f);
      byType.set(f.trigger_type, list);
    }
    return TRIGGER_CATALOG.map((c) => ({
      ...c,
      flows: byType.get(c.type) ?? [],
    }));
  }, [flowsQuery.data]);

  return { data: map, isLoading: flowsQuery.isLoading, refetch: flowsQuery.refetch };
}

export function useTriggerTestEvent() {
  return useMutation({
    mutationFn: async ({
      empresaId,
      eventType,
      entityType,
    }: {
      empresaId: string;
      eventType: FlowTriggerType;
      entityType: string;
    }) => {
      const syntheticId = crypto.randomUUID();
      const { error } = await (supabase.from("orbit_flow_events" as any) as any).insert({
        empresa_id: empresaId,
        event_type: eventType,
        entity_type: entityType,
        entity_id: syntheticId,
        payload: { is_test: true, triggered_at: new Date().toISOString() },
        dedupe_key: `test:${eventType}:${syntheticId}`,
      });
      if (error) throw error;
      // Fire-and-forget invoke do dispatcher para acelerar (cron também cobre em ≤1min)
      try {
        await supabase.functions.invoke("orbit-flow-dispatcher", {
          body: { trigger: "manual-test", event_type: eventType },
        });
      } catch {
        /* ignora — cron pega em seguida */
      }
      return syntheticId;
    },
  });
}
