import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrbitFlow = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  trigger_type: "prospect_qualified" | "deal_stage_changed" | "deal_idle" | "conversa_no_reply" | "meeting_reminder_24h" | "meeting_reminder_1h" | "lead_recebido";
  trigger_config: Record<string, any>;
  condicoes: Record<string, any>;
  ativo: boolean;
  template_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrbitFlowActionType =
  | "send_whatsapp_template"
  | "move_deal_stage"
  | "change_deal_stage"
  | "create_task"
  | "toggle_ai_agent"
  | "notify_vendedor"
  | "send_rich_media"
  | "check_calendar_and_offer"
  | "delay_execution"
  | "if_else";

export type OrbitFlowAction = {
  id: string;
  flow_id: string;
  ordem: number;
  action_type: OrbitFlowActionType;
  action_config: Record<string, any>;
  delay_seconds: number;
};

export function useUpsertFlowAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: {
      id?: string;
      flow_id: string;
      ordem: number;
      action_type: OrbitFlowActionType;
      action_config: Record<string, any>;
      delay_seconds?: number;
    }) => {
      const row: any = {
        flow_id: action.flow_id,
        ordem: action.ordem,
        action_type: action.action_type,
        action_config: action.action_config ?? {},
        delay_seconds: action.delay_seconds ?? 0,
      };
      if (action.id) row.id = action.id;
      const { data, error } = await (supabase.from("orbit_flow_actions" as any) as any)
        .upsert(row)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["orbit-flow-actions", v.flow_id] }),
  });
}

export function useDeleteFlowAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; flow_id: string }) => {
      const { error } = await (supabase.from("orbit_flow_actions" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["orbit-flow-actions", v.flow_id] }),
  });
}


export type OrbitFlowTemplate = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  definicao: any;
  ativo?: boolean;
  is_global?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type OrbitFlowRun = {
  id: string;
  flow_id: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  created_at: string;
};

export function useOrbitFlows(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["orbit-flows", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_flows" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrbitFlow[];
    },
  });
}

export function useOrbitFlowTemplates() {
  return useQuery({
    queryKey: ["orbit-flow-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("orbit_flow_templates" as any) as any)
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as OrbitFlowTemplate[];
    },
  });
}

export function useOrbitFlowActions(flowId: string | null | undefined) {
  return useQuery({
    queryKey: ["orbit-flow-actions", flowId],
    enabled: !!flowId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_flow_actions" as any)
        .select("*")
        .eq("flow_id", flowId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as OrbitFlowAction[];
    },
  });
}

export function useOrbitFlowRuns(flowId: string | null | undefined) {
  return useQuery({
    queryKey: ["orbit-flow-runs", flowId],
    enabled: !!flowId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_flow_runs" as any)
        .select("*")
        .eq("flow_id", flowId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as OrbitFlowRun[];
    },
  });
}

export function useToggleFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("orbit_flows" as any).update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-flows"] }),
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_flows" as any)
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-flows"] }),
  });
}

export function useCreateFlowFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ empresaId, template }: { empresaId: string; template: OrbitFlowTemplate | null }) => {
      const def = template?.definicao ?? {};
      const { data: flow, error: e1 } = await (supabase
        .from("orbit_flows" as any) as any)
        .insert({
          empresa_id: empresaId,
          template_id: template?.id ?? null,
          nome: template?.nome ?? "Novo fluxo",
          descricao: template?.descricao ?? null,
          trigger_type: def.trigger_type ?? "deal_stage_changed",
          trigger_config: def.trigger_config ?? {},
          condicoes: def.condicoes ?? {},
          ativo: false,
        })
        .select("id")
        .maybeSingle();
      if (e1) throw e1;
      const flowId = (flow as any)?.id as string | undefined;
      const actions = Array.isArray(def.actions) ? def.actions : [];
      if (flowId && actions.length) {
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
