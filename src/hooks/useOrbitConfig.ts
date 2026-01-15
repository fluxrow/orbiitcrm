import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type AIConfig = Tables<"orbit_ai_config">;
type AIConfigUpdate = TablesUpdate<"orbit_ai_config">;

export function useOrbitAIConfig() {
  return useQuery({
    queryKey: ["orbit_ai_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_ai_config")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateAIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: AIConfigUpdate) => {
      // First check if config exists
      const { data: existing } = await supabase
        .from("orbit_ai_config")
        .select("id")
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("orbit_ai_config")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("orbit_ai_config")
          .insert(updates as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_ai_config"] });
    },
  });
}

export function useOrbitZAPIConfig() {
  return useQuery({
    queryKey: ["orbit_zapi_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_zapi_config")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateZAPIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: any) => {
      const { data: existing } = await supabase
        .from("orbit_zapi_config")
        .select("id")
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("orbit_zapi_config")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("orbit_zapi_config")
          .insert(updates)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_zapi_config"] });
    },
  });
}

export function useOrbitDistribuicao() {
  return useQuery({
    queryKey: ["orbit_distribuicao_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_distribuicao_config")
        .select(`
          *,
          vendedor:profiles!orbit_distribuicao_config_vendedor_id_fkey(id, nome, email)
        `)
        .order("ordem_fila", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddVendedorToDistribuicao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vendedor_id, ordem_fila }: { vendedor_id: string; ordem_fila?: number }) => {
      const { data, error } = await supabase
        .from("orbit_distribuicao_config")
        .insert({ vendedor_id, ordem_fila: ordem_fila || 0 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_distribuicao_config"] });
    },
  });
}

export function useToggleVendedorDistribuicao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { data, error } = await supabase
        .from("orbit_distribuicao_config")
        .update({ ativo })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_distribuicao_config"] });
    },
  });
}

export function useRemoveVendedorFromDistribuicao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_distribuicao_config")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_distribuicao_config"] });
    },
  });
}
