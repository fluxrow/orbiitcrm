import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

export type TenantOpsActionType =
  | "pause_tenant_ai"
  | "resume_tenant_ai"
  | "retry_failed_queues"
  | "clear_pending_queues"
  | "toggle_whatsapp_live_send"
  | "pause_queue_processing"
  | "resume_queue_processing"
  | "preview_stale_messages"
  | "cancel_stale_messages"
  | "update_agenda_config"
  | "add_agenda_date_exception"
  | "soft_delete_media"
  | "restore_soft_deleted_media";

export interface TenantOpsActionResult {
  ok: true;
  action: TenantOpsActionType;
  affected_rows: number;
  preview_count?: number;
  new_state?: boolean;
  linked_count?: number;
  entity_id?: string;
  message: string;
}

export interface TenantOpsActionInput {
  action: TenantOpsActionType;
  payload?: Record<string, Json | undefined>;
}

export function useTenantOpsActions() {
  const { slug, empresaId } = useTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ action, payload = {} }: TenantOpsActionInput): Promise<TenantOpsActionResult> => {
      if (!slug || !empresaId) throw new Error("Contexto do tenant indisponível.");

      const { data, error } = await supabase.rpc("orbit_tenant_ops_action", {
        p_tenant_slug: slug,
        p_action_type: action,
        p_payload: payload as Json,
      });

      if (error) throw error;
      const result = data as unknown as Partial<TenantOpsActionResult>;
      if (result.ok !== true) throw new Error("A ação não foi confirmada pelo servidor.");
      return result as TenantOpsActionResult;
    },
    onSuccess: async (result) => {
      if (result.action === "preview_stale_messages") return;
      toast({
        title: result.message,
        description: `${result.affected_rows} registro(s) alterado(s).`,
      });
      await queryClient.invalidateQueries({ queryKey: ["tenant-operations", empresaId] });
    },
    onError: (error) => {
      toast({
        title: "Ação operacional não executada",
        description: error instanceof Error ? error.message : "Falha inesperada.",
        variant: "destructive",
      });
    },
  });
}
