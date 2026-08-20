import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";

export interface SupportSession { active: boolean; is_master_super_admin: boolean; session_id?: string; reason?: string; started_at?: string; expires_at?: string }
export interface AlertConfig { operational_emails: string[]; fallback_email: string; email_enabled: boolean; queue_warning_threshold: number; queue_critical_threshold: number; instance_offline_minutes: number; updated_at: string | null }
export interface AuditItem { id: string; occurred_at: string; actor_id: string | null; actor_display_name: string; actor_type: "user"|"support_jit"|"system"; action: string; resource_type: string; resource_id: string | null; result: string; reason: string | null; details: Record<string, unknown> }
export interface AuditPage { items: AuditItem[]; total: number; limit: number; offset: number; has_more: boolean; retention_days: number; sanitized: boolean }

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
}

export function useActiveSupportSession() {
  const { slug, empresaId } = useTenant();
  return useQuery({
    queryKey: ["tenant-support-session", empresaId],
    enabled: Boolean(slug && empresaId), refetchInterval: 15_000,
    queryFn: () => rpc<SupportSession>("orbit_get_active_jit_support_session", { p_tenant_slug: slug }),
  });
}

export function useSupportSessionActions() {
  const { slug, empresaId } = useTenant(); const client=useQueryClient(); const { toast }=useToast();
  return useMutation({
    mutationFn: async (input: { type:"start";reason:string }|{ type:"end";sessionId:string }) => input.type==="start"
      ? rpc<SupportSession>("orbit_start_jit_support_session",{p_tenant_slug:slug,p_reason:input.reason})
      : rpc<SupportSession>("orbit_end_jit_support_session",{p_session_id:input.sessionId}),
    onSuccess: async (_,input) => { toast({title:input.type==="start"?"Sessão de suporte iniciada":"Sessão de suporte encerrada"});await client.invalidateQueries({queryKey:["tenant-support-session",empresaId]}); },
    onError: (error) => toast({title:"Não foi possível alterar a sessão de suporte",description:error instanceof Error?error.message:"Falha inesperada",variant:"destructive"}),
  });
}

export function useTenantAlertConfig() {
  const {slug,empresaId}=useTenant();
  return useQuery({queryKey:["tenant-alert-config",empresaId],enabled:Boolean(slug&&empresaId),queryFn:()=>rpc<AlertConfig>("orbit_get_tenant_alert_config",{p_tenant_slug:slug})});
}

export function useTenantAuditLogs(actionFilter:string,limit:number,offset:number,enabled=true) {
  const {slug,empresaId}=useTenant();
  return useQuery({queryKey:["tenant-audit-logs",empresaId,actionFilter,limit,offset],enabled:enabled&&Boolean(slug&&empresaId),queryFn:()=>rpc<AuditPage>("orbit_get_tenant_audit_logs",{p_tenant_slug:slug,p_action_filter:actionFilter||null,p_limit:limit,p_offset:offset})});
}
