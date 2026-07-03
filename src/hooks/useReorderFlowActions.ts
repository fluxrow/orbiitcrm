import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrbitFlowAction } from "./useOrbitFlows";

// Persiste nova ordem de várias ações em um único upsert em lote.
// Só envia as linhas cuja `ordem` mudou.
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
      if (!changed.length) return;
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
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["orbit-flow-actions", v.flow_id] }),
  });
}
