import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export function useSegmentos() {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["segmentos", orgId],
    queryFn: async () => {
      let query = supabase.from("segmentos" as any).select("*").order("macro").order("micro");
      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateSegmento() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (seg: { organization_id: string; macro: string; micro?: string }) => {
      const { data, error } = await supabase.from("segmentos" as any).insert(seg).select().single();
      if (error) throw error;
      await supabase.from("pe_audit_log" as any).insert({
        organization_id: seg.organization_id,
        actor_user_id: user?.id,
        action: "SEGMENTO_CREATED",
        entity_type: "segmento",
        entity_id: (data as any).id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["segmentos"] }); toast.success("Segmento criado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateSegmento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; macro?: string; micro?: string; is_active?: boolean }) => {
      const { data, error } = await supabase.from("segmentos" as any).update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["segmentos"] }); toast.success("Segmento atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteSegmento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("segmentos" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["segmentos"] }); toast.success("Segmento removido"); },
    onError: (e: any) => toast.error(e.message),
  });
}
