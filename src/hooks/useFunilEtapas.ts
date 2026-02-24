import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

const DEFAULT_STAGES = [
  { nome: "Prospecção", ordem: 1, tipo: "open" },
  { nome: "Qualificação", ordem: 2, tipo: "open" },
  { nome: "Proposta", ordem: 3, tipo: "open" },
  { nome: "Negociação", ordem: 4, tipo: "open" },
  { nome: "Fechado Ganho", ordem: 5, tipo: "won" },
  { nome: "Fechado Perdido", ordem: 6, tipo: "lost" },
];

export function useFunilEtapas() {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["funil-etapas", orgId],
    queryFn: async () => {
      let query = supabase
        .from("funil_etapas")
        .select("*")
        .eq("is_active", true)
        .order("ordem");

      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateFunilEtapa() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (e: { organization_id: string; nome: string; ordem: number; tipo: string }) => {
      const { data, error } = await supabase.from("funil_etapas").insert(e).select().single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: e.organization_id,
        actor_user_id: user?.id,
        action: "FUNIL_ETAPA_CREATED",
        entity_type: "funil_etapa",
        entity_id: data.id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funil-etapas"] }); toast.success("Etapa criada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateFunilEtapa() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nome?: string; ordem?: number; tipo?: string; is_active?: boolean }) => {
      const { data: before } = await supabase.from("funil_etapas").select("*").eq("id", id).single();
      const { data, error } = await supabase.from("funil_etapas").update(updates).eq("id", id).select().single();
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: before.organization_id,
          actor_user_id: user?.id,
          action: "FUNIL_ETAPA_UPDATED",
          entity_type: "funil_etapa",
          entity_id: id,
          metadata: { before, after: updates },
        });
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funil-etapas"] }); toast.success("Etapa atualizada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteFunilEtapa() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await supabase.from("funil_etapas").select("*").eq("id", id).single();
      const { error } = await supabase.from("funil_etapas").update({ is_active: false }).eq("id", id);
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: before.organization_id,
          actor_user_id: user?.id,
          action: "FUNIL_ETAPA_DEACTIVATED",
          entity_type: "funil_etapa",
          entity_id: id,
          metadata: { before },
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funil-etapas"] }); toast.success("Etapa desativada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateDefaultStages() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const rows = DEFAULT_STAGES.map((s) => ({ ...s, organization_id: organizationId }));
      const { data, error } = await supabase.from("funil_etapas").insert(rows).select();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: organizationId,
        actor_user_id: user?.id,
        action: "DEFAULT_STAGES_CREATED",
        entity_type: "funil_etapa",
        metadata: { count: rows.length },
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funil-etapas"] }); toast.success("Etapas padrão criadas"); },
    onError: (e: any) => toast.error(e.message),
  });
}
