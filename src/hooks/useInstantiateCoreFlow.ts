// Instancia o [CORE] Orbit Core Flow em um tenant, injetando variáveis do
// cliente (empresa.nome, vendedor.telefone, link_agendamento).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { injectPlaceholderValues } from "@/lib/flowTemplateSchema";
import type { OrbitFlowTemplate } from "@/hooks/useOrbitFlows";

export type InstantiateVars = {
  "empresa.nome"?: string;
  "vendedor.telefone"?: string;
  link_agendamento?: string;
};

export function useInstantiateCoreFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      empresaId,
      template,
      values,
    }: {
      empresaId: string;
      template: OrbitFlowTemplate;
      values: InstantiateVars;
    }) => {
      const patched = injectPlaceholderValues(template.definicao ?? {}, values as Record<string, string>);
      const { data: flow, error: e1 } = await (supabase.from("orbit_flows" as any) as any)
        .insert({
          empresa_id: empresaId,
          template_id: template.id,
          nome: template.nome,
          descricao: template.descricao ?? null,
          trigger_type: patched.trigger_type ?? "lead_recebido",
          trigger_config: patched.trigger_config ?? {},
          condicoes: patched.condicoes ?? {},
          ativo: false,
        })
        .select("id")
        .maybeSingle();
      if (e1) throw e1;
      const flowId = (flow as any)?.id as string;
      const actions = Array.isArray(patched.actions) ? patched.actions : [];
      if (actions.length) {
        const rows = actions.map((a: any, i: number) => ({
          flow_id: flowId,
          ordem: i,
          action_type: a.action_type,
          action_config: a.action_config ?? {},
          delay_seconds: a.delay_seconds ?? 0,
        }));
        const { error: e2 } = await (supabase.from("orbit_flow_actions" as any) as any).insert(rows);
        if (e2) throw e2;
      }
      return flowId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-flows"] }),
  });
}
