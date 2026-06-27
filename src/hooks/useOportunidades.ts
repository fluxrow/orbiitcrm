import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export interface OportunidadeFilters {
  etapa_id?: string;
  status?: string;
  owner_user_id?: string;
  cliente_id?: string;
  destino?: string;
  search?: string;
}

export function useOportunidades(filters?: OportunidadeFilters) {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["oportunidades", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("oportunidades")
        .select("*, clientes(razao_social, nome_fantasia), funil_etapas(nome, tipo, ordem), owner:pe_users!oportunidades_owner_user_id_fkey(full_name)")
        .order("created_at", { ascending: false });

      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }
      if (filters?.etapa_id) query = query.eq("etapa_id", filters.etapa_id);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.owner_user_id) query = query.eq("owner_user_id", filters.owner_user_id);
      if (filters?.cliente_id) query = query.eq("cliente_id", filters.cliente_id);
      if (filters?.destino) query = query.ilike("destino", `%${filters.destino}%`);
      if (filters?.search) query = query.ilike("titulo", `%${filters.search}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useOportunidade(id: string | undefined) {
  return useQuery({
    queryKey: ["oportunidade", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("oportunidades")
        .select("*, clientes(razao_social, nome_fantasia), funil_etapas(nome, tipo, ordem), owner:pe_users!oportunidades_owner_user_id_fkey(full_name, email)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateOportunidade() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (o: {
      organization_id: string;
      titulo: string;
      cliente_id: string;
      etapa_id: string;
      owner_user_id: string;
      destino?: string;
      data_ida?: string;
      data_volta?: string;
      viajantes_qtd?: number;
      probabilidade?: number;
      valor_total_estimado?: number;
    }) => {
      const { data, error } = await supabase
        .from("oportunidades")
        .insert({ ...o, created_by_user_id: user?.id })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: o.organization_id,
        actor_user_id: user?.id,
        action: "OPORTUNIDADE_CREATED",
        entity_type: "oportunidade",
        entity_id: data.id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oportunidades"] }); toast.success("Oportunidade criada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOportunidade() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await supabase.from("oportunidades").select("*").eq("id", id).single();
      const { data, error } = await supabase.from("oportunidades").update(updates as any).eq("id", id).select().single();
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: before.organization_id,
          actor_user_id: user?.id,
          action: "OPORTUNIDADE_UPDATED",
          entity_type: "oportunidade",
          entity_id: id,
          metadata: { before, after: updates },
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      qc.invalidateQueries({ queryKey: ["oportunidade"] });
      toast.success("Oportunidade atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useMoveOportunidade() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, etapa_id }: { id: string; etapa_id: string }) => {
      // Apenas atualiza etapa_id; banco define status e closed_at via trigger
      const { data, error } = await supabase
        .from("oportunidades")
        .update({ etapa_id })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: data.organization_id,
        actor_user_id: user?.id,
        action: "OPORTUNIDADE_MOVED",
        entity_type: "oportunidade",
        entity_id: id,
        metadata: { etapa_id, status: data.status },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      qc.invalidateQueries({ queryKey: ["oportunidade"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
