import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Prospect = Tables<"orbit_prospects">;
type ProspectInsert = TablesInsert<"orbit_prospects">;
type ProspectUpdate = TablesUpdate<"orbit_prospects">;

interface ProspectFilters {
  search?: string;
  status_qualificacao?: string;
  origem_contato?: string;
  responsavel_id?: string;
}

export function useOrbitProspects(filters?: ProspectFilters) {
  return useQuery({
    queryKey: ["orbit_prospects", filters],
    queryFn: async () => {
      let query = supabase
        .from("orbit_prospects")
        .select("*, responsavel:profiles!orbit_prospects_responsavel_id_fkey(id, nome, email)")
        .order("created_at", { ascending: false });

      if (filters?.search) {
        query = query.or(`nome_razao.ilike.%${filters.search}%,nome_fantasia.ilike.%${filters.search}%,email_principal.ilike.%${filters.search}%,telefone_whatsapp.ilike.%${filters.search}%`);
      }

      if (filters?.status_qualificacao && filters.status_qualificacao !== "all") {
        query = query.eq("status_qualificacao", filters.status_qualificacao);
      }

      if (filters?.origem_contato && filters.origem_contato !== "all") {
        query = query.eq("origem_contato", filters.origem_contato);
      }

      if (filters?.responsavel_id) {
        query = query.eq("responsavel_id", filters.responsavel_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useOrbitProspect(id: string | undefined) {
  return useQuery({
    queryKey: ["orbit_prospect", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("orbit_prospects")
        .select("*, responsavel:profiles!orbit_prospects_responsavel_id_fkey(id, nome, email)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateProspect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prospect: ProspectInsert) => {
      const { data, error } = await supabase
        .from("orbit_prospects")
        .insert(prospect)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_prospects"] });
    },
  });
}

export function useUpdateProspect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ProspectUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_prospects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orbit_prospects"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_prospect", variables.id] });
    },
  });
}

export function useDeleteProspect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_prospects")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_prospects"] });
    },
  });
}
