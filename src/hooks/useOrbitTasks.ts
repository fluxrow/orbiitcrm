import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface OrbitTaskFilters {
  status?: string;
  prioridade?: string;
  assigned_to?: string;
  prospect_id?: string;
  search?: string;
}

export function useOrbitTasks(filters?: OrbitTaskFilters) {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_tasks", empresaId, filters],
    enabled: !!empresaId,
    queryFn: async () => {
      let query = supabase
        .from("orbit_tasks" as any)
        .select("*, prospect:orbit_prospects!orbit_tasks_prospect_id_fkey(id, nome_razao), assignee:profiles!orbit_tasks_assigned_to_fkey(id, nome, email)")
        .eq("empresa_id", empresaId!)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.prioridade && filters.prioridade !== "all") {
        query = query.eq("prioridade", filters.prioridade);
      }
      if (filters?.assigned_to) {
        query = query.eq("assigned_to", filters.assigned_to);
      }
      if (filters?.prospect_id) {
        query = query.eq("prospect_id", filters.prospect_id);
      }
      if (filters?.search) {
        query = query.or(`titulo.ilike.%${filters.search}%,descricao.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateOrbitTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (task: {
      empresa_id: string;
      titulo: string;
      descricao?: string;
      prospect_id?: string;
      deal_id?: string;
      assigned_to?: string;
      prioridade?: string;
      tipo_tarefa?: string;
      due_date?: string;
      due_time?: string;
      notificar_responsavel?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("orbit_tasks" as any)
        .insert({ ...task, created_by: user?.id, status: "pending" })
        .select()
        .single();
      if (error) throw error;

      // Register prospect event
      if (task.prospect_id && task.empresa_id) {
        await supabase.from("prospect_events" as any).insert({
          empresa_id: task.empresa_id,
          prospect_id: task.prospect_id,
          actor_user_id: user?.id,
          event_type: "task_created",
          titulo: "Tarefa criada",
          descricao: task.titulo,
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_tasks"] });
      toast.success("Tarefa criada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOrbitTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; titulo?: string; descricao?: string; prioridade?: string; status?: string; due_date?: string; due_time?: string; assigned_to?: string; tipo_tarefa?: string }) => {
      const { data, error } = await supabase
        .from("orbit_tasks" as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_tasks"] });
      toast.success("Tarefa atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCompleteOrbitTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, prospect_id, empresa_id }: { id: string; prospect_id?: string; empresa_id: string }) => {
      const { data, error } = await supabase
        .from("orbit_tasks" as any)
        .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      if (prospect_id && empresa_id) {
        await supabase.from("prospect_events" as any).insert({
          empresa_id,
          prospect_id,
          actor_user_id: user?.id,
          event_type: "task_completed",
          titulo: "Tarefa concluída",
          descricao: (data as any).titulo,
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_tasks"] });
      toast.success("Tarefa concluída");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
