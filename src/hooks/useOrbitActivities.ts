import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";

type Activity = Tables<"orbit_activities">;
type ActivityInsert = TablesInsert<"orbit_activities">;
type ActivityUpdate = TablesUpdate<"orbit_activities">;

interface ActivityFilters {
  prospect_id?: string;
  deal_id?: string;
  tipo?: string;
  concluida?: boolean;
}

export function useOrbitActivities(filters?: ActivityFilters) {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_activities", empresaId, filters],
    enabled: !!empresaId,
    queryFn: async () => {
      let query = supabase
        .from("orbit_activities")
        .select("*, responsavel:profiles!orbit_activities_responsavel_id_fkey(id, nome, email)")
        .order("data_atividade", { ascending: false });

      if (filters?.prospect_id) {
        query = query.eq("prospect_id", filters.prospect_id);
      }

      if (filters?.deal_id) {
        query = query.eq("deal_id", filters.deal_id);
      }

      if (filters?.tipo) {
        query = query.eq("tipo", filters.tipo);
      }

      if (filters?.concluida !== undefined) {
        query = query.eq("concluida", filters.concluida);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activity: ActivityInsert) => {
      const { data, error } = await supabase
        .from("orbit_activities")
        .insert(activity)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_activities"] });
    },
  });
}

export function useUpdateActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ActivityUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_activities")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_activities"] });
    },
  });
}

export function useToggleActivityComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, concluida }: { id: string; concluida: boolean }) => {
      const { data, error } = await supabase
        .from("orbit_activities")
        .update({ concluida })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_activities"] });
    },
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_activities")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_activities"] });
    },
  });
}
