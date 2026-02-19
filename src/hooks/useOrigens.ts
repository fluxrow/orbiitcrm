import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export function useOrigens() {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["origens", orgId],
    queryFn: async () => {
      let query = supabase.from("origens" as any).select("*").order("nome");
      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateOrigem() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (o: { organization_id: string; nome: string; descricao?: string }) => {
      const { data, error } = await supabase.from("origens" as any).insert(o).select().single();
      if (error) throw error;
      await supabase.from("pe_audit_log" as any).insert({
        organization_id: o.organization_id,
        actor_user_id: user?.id,
        action: "ORIGEM_CREATED",
        entity_type: "origem",
        entity_id: (data as any).id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["origens"] }); toast.success("Origem criada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOrigem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nome?: string; descricao?: string; is_active?: boolean }) => {
      const { data, error } = await supabase.from("origens" as any).update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["origens"] }); toast.success("Origem atualizada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteOrigem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("origens" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["origens"] }); toast.success("Origem removida"); },
    onError: (e: any) => toast.error(e.message),
  });
}
