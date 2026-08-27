import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { isTenantFeatureEnabled } from "@/lib/tenant-explicit-mutations";

export const TENANT_FLOWS_CONTEXT_WAVE3_FLAG = "tenant_flows_context_wave3_v1" as const;

export async function usesScopedFlows(empresaId?: string | null, tenantSlug?: string | null) {
  return !!empresaId && !!tenantSlug && await isTenantFeatureEnabled(empresaId, TENANT_FLOWS_CONTEXT_WAVE3_FLAG);
}

export async function readTenantFlowsScoped<T>(tenantSlug: string, section: "flows" | "actions" | "runs", flowId?: string | null) {
  const { data, error } = await supabase.rpc("orbit_tenant_flows_read_scoped" as any, {
    p_tenant_slug: tenantSlug, p_section: section, p_flow_id: flowId ?? null,
  } as any);
  if (error) throw error;
  return (((data as any)?.data ?? []) as T[]);
}

export async function mutateTenantFlowScoped<T>(tenantSlug: string, actionType: string, flowId: string | null, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc("orbit_tenant_flows_mutate_scoped" as any, {
    p_tenant_slug: tenantSlug, p_action_type: actionType, p_flow_id: flowId, p_payload: payload,
  } as any);
  if (error) throw error;
  return data as T;
}

export type OrbitFlow = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  trigger_type: "prospect_qualified" | "deal_stage_changed" | "deal_idle" | "conversa_no_reply" | "meeting_reminder_24h" | "meeting_reminder_1h" | "meeting_reminder_5m" | "lead_recebido";
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
  | "if_else"
  | "switch";

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
  const { empresaId, slug } = useTenant();
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
      if (await usesScopedFlows(empresaId, slug)) {
        const result = await mutateTenantFlowScoped<any>(slug!, "upsert_action", action.flow_id, row);
        return result?.data;
      }
      const { data, error } = await (supabase.from("orbit_flow_actions" as any) as any)
        .upsert(row)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-flow-actions"] }),
  });
}

export function useDeleteFlowAction() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async ({ id, flow_id }: { id: string; flow_id: string }) => {
      if (await usesScopedFlows(empresaId, slug)) {
        await mutateTenantFlowScoped(slug!, "delete_action", flow_id, { action_id: id });
        return;
      }
      const { error } = await (supabase.from("orbit_flow_actions" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-flow-actions"] }),
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
  is_official?: boolean;
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
  const { slug } = useTenant();
  return useQuery({
    queryKey: ["orbit-flows", empresaId, slug],
    enabled: !!empresaId,
    queryFn: async () => {
      if (await usesScopedFlows(empresaId, slug)) return readTenantFlowsScoped<OrbitFlow>(slug!, "flows");
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
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["orbit-flow-actions", empresaId, slug, flowId],
    enabled: !!flowId,
    queryFn: async () => {
      if (await usesScopedFlows(empresaId, slug)) return readTenantFlowsScoped<OrbitFlowAction>(slug!, "actions", flowId);
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
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["orbit-flow-runs", empresaId, slug, flowId],
    enabled: !!flowId,
    queryFn: async () => {
      if (await usesScopedFlows(empresaId, slug)) return readTenantFlowsScoped<OrbitFlowRun>(slug!, "runs", flowId);
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
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      if (await usesScopedFlows(empresaId, slug)) {
        await mutateTenantFlowScoped(slug!, "toggle_flow", id, { ativo }); return;
      }
      const { error } = await supabase.from("orbit_flows" as any).update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-flows"] }),
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (id: string) => {
      if (await usesScopedFlows(empresaId, slug)) {
        await mutateTenantFlowScoped(slug!, "soft_delete_flow", id); return;
      }
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
  const { slug } = useTenant();
  return useMutation({
    mutationFn: async ({ empresaId, template }: { empresaId: string; template: OrbitFlowTemplate | null }) => {
      const def = template?.definicao ?? {};
      if (await usesScopedFlows(empresaId, slug)) {
        const result = await mutateTenantFlowScoped<any>(slug!, "create_flow", null, {
          template_id: template?.id ?? null, nome: template?.nome ?? "Novo fluxo",
          descricao: template?.descricao ?? null, trigger_type: def.trigger_type ?? "deal_stage_changed",
          trigger_config: def.trigger_config ?? {}, condicoes: def.condicoes ?? {}, actions: Array.isArray(def.actions) ? def.actions : [],
        });
        return result?.flow_id as string | undefined;
      }
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
