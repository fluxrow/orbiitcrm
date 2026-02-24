import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export interface TarefaFilters {
  status?: string;
  prioridade?: string;
  assigned_to_user_id?: string;
  oportunidade_id?: string;
  cliente_id?: string;
}

export function useTarefas(filters?: TarefaFilters) {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["tarefas", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("tarefas")
        .select("*, assigned:pe_users!tarefas_assigned_to_user_id_fkey(full_name), clientes(razao_social), oportunidades(titulo)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.prioridade) query = query.eq("prioridade", filters.prioridade);
      if (filters?.assigned_to_user_id) query = query.eq("assigned_to_user_id", filters.assigned_to_user_id);
      if (filters?.oportunidade_id) query = query.eq("oportunidade_id", filters.oportunidade_id);
      if (filters?.cliente_id) query = query.eq("cliente_id", filters.cliente_id);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTarefa() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (t: {
      organization_id: string;
      titulo: string;
      cliente_id: string;
      assigned_to_user_id: string;
      oportunidade_id?: string;
      contato_id?: string;
      descricao?: string;
      prioridade?: string;
      due_date?: string;
    }) => {
      const { data, error } = await supabase
        .from("tarefas")
        .insert({ ...t, created_by_user_id: user?.id })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: t.organization_id,
        actor_user_id: user?.id,
        action: "TAREFA_CREATED",
        entity_type: "tarefa",
        entity_id: data.id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tarefas"] }); toast.success("Tarefa criada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTarefa() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; titulo?: string; descricao?: string; prioridade?: string; status?: string; due_date?: string; assigned_to_user_id?: string }) => {
      const { data: before } = await supabase.from("tarefas").select("*").eq("id", id).single();
      const { data, error } = await supabase.from("tarefas").update(updates).eq("id", id).select().single();
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: before.organization_id,
          actor_user_id: user?.id,
          action: "TAREFA_UPDATED",
          entity_type: "tarefa",
          entity_id: id,
          metadata: { before, after: updates },
        });
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tarefas"] }); toast.success("Tarefa atualizada"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useMarkTarefaDone() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, organization_id }: { id: string; organization_id: string }) => {
      const { data, error } = await supabase
        .from("tarefas")
        .update({ status: "done", done_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id,
        actor_user_id: user?.id,
        action: "TAREFA_DONE",
        entity_type: "tarefa",
        entity_id: id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tarefas"] }); toast.success("Tarefa concluída"); },
    onError: (e: any) => toast.error(e.message),
  });
}
