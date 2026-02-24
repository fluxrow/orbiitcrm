import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useClienteOrigens(clienteId?: string) {
  return useQuery({
    queryKey: ["cliente_origem", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data, error } = await supabase
        .from("cliente_origem" as any)
        .select("*, origens(nome)")
        .eq("cliente_id", clienteId)
        .order("data_importacao", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!clienteId,
  });
}

export function useLinkClienteOrigem() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (link: { organization_id: string; cliente_id: string; origem_id: string; lista?: string; observacao?: string }) => {
      const { data, error } = await supabase.from("cliente_origem" as any).insert(link).select().single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: link.organization_id,
        actor_user_id: user?.id,
        action: "CLIENTE_ORIGEM_LINKED",
        entity_type: "cliente_origem",
        entity_id: (data as any).id,
        metadata: { cliente_id: link.cliente_id, origem_id: link.origem_id },
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cliente_origem"] }); toast.success("Origem vinculada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUnlinkClienteOrigem() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await supabase.from("cliente_origem" as any).select("*").eq("id", id).single();
      const { error } = await supabase.from("cliente_origem" as any).delete().eq("id", id);
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: (before as any).organization_id,
          actor_user_id: user?.id,
          action: "CLIENTE_ORIGEM_UNLINKED",
          entity_type: "cliente_origem",
          entity_id: id,
          metadata: { before },
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cliente_origem"] }); toast.success("Origem desvinculada"); },
    onError: (e: any) => toast.error(e.message),
  });
}
