import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrbitFlowAction } from "./useOrbitFlows";

// Persiste nova ordem de várias ações em um único upsert em lote,
// com atualização otimista do cache (UI reflete instantaneamente) e
// rollback caso o servidor falhe.
export function useReorderFlowActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      flow_id,
      ordered,
      previous,
    }: {
      flow_id: string;
      ordered: OrbitFlowAction[];
      previous: OrbitFlowAction[];
    }) => {
      const prevById = new Map(previous.map((a) => [a.id, a.ordem]));
      const changed = ordered
        .map((a, i) => ({ ...a, ordem: i }))
        .filter((a) => prevById.get(a.id) !== a.ordem);
      if (!changed.length) return { changed: 0 };
      const rows = changed.map((a) => ({
        id: a.id,
        flow_id: a.flow_id,
        ordem: a.ordem,
        action_type: a.action_type,
        action_config: a.action_config ?? {},
        delay_seconds: a.delay_seconds ?? 0,
      }));
      const { error } = await (supabase.from("orbit_flow_actions" as any) as any).upsert(rows);
      if (error) throw error;
      return { changed: changed.length };
    },
    onMutate: async ({ flow_id, ordered }) => {
      const key = ["orbit-flow-actions", flow_id];
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<OrbitFlowAction[]>(key);
      const optimistic = ordered.map((a, i) => ({ ...a, ordem: i }));
      qc.setQueryData(key, optimistic);
      return { snapshot, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot && ctx.key) qc.setQueryData(ctx.key, ctx.snapshot);
    },
    onSettled: (_data, _err, v) => {
      qc.invalidateQueries({ queryKey: ["orbit-flow-actions", v.flow_id] });
    },
  });
}
