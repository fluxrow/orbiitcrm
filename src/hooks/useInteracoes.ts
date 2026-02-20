import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export function useInteracoes(filters?: { oportunidade_id?: string; cliente_id?: string }) {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["interacoes", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("interacoes")
        .select("*, pe_users:user_id(full_name), contatos(nome), clientes(razao_social)")
        .order("data_interacao", { ascending: false });

      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }
      if (filters?.oportunidade_id) query = query.eq("oportunidade_id", filters.oportunidade_id);
      if (filters?.cliente_id) query = query.eq("cliente_id", filters.cliente_id);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateInteracao() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (i: {
      organization_id: string;
      cliente_id: string;
      tipo: string;
      resumo: string;
      oportunidade_id?: string;
      contato_id?: string;
      data_followup?: string;
      proxima_acao?: string;
    }) => {
      const { data, error } = await supabase
        .from("interacoes")
        .insert({ ...i, user_id: user?.id })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: i.organization_id,
        actor_user_id: user?.id,
        action: "INTERACAO_CREATED",
        entity_type: "interacao",
        entity_id: data.id,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interacoes"] });
      toast.success("Interação registrada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
