import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Deal = Tables<"orbit_deals">;
type DealInsert = TablesInsert<"orbit_deals">;
type DealUpdate = TablesUpdate<"orbit_deals">;

export function useOrbitPipelineStages() {
  return useQuery({
    queryKey: ["orbit_pipeline_stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_pipeline_stages")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useOrbitDeals(etapa_id?: string) {
  return useQuery({
    queryKey: ["orbit_deals", etapa_id],
    queryFn: async () => {
      let query = supabase
        .from("orbit_deals")
        .select(`
          *,
          prospect:orbit_prospects!orbit_deals_prospect_id_fkey(id, nome_razao, nome_fantasia),
          etapa:orbit_pipeline_stages!orbit_deals_etapa_id_fkey(id, nome, cor, is_won, is_lost),
          responsavel:profiles!orbit_deals_responsavel_id_fkey(id, nome)
        `)
        .order("created_at", { ascending: false });

      if (etapa_id) {
        query = query.eq("etapa_id", etapa_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useOrbitDealsGrouped() {
  return useQuery({
    queryKey: ["orbit_deals_grouped"],
    queryFn: async () => {
      // Fetch stages
      const { data: stages, error: stagesError } = await supabase
        .from("orbit_pipeline_stages")
        .select("*")
        .order("ordem", { ascending: true });
      if (stagesError) throw stagesError;

      // Fetch all deals
      const { data: deals, error: dealsError } = await supabase
        .from("orbit_deals")
        .select(`
          *,
          prospect:orbit_prospects!orbit_deals_prospect_id_fkey(id, nome_razao, nome_fantasia),
          responsavel:profiles!orbit_deals_responsavel_id_fkey(id, nome)
        `)
        .order("created_at", { ascending: false });
      if (dealsError) throw dealsError;

      // Group deals by stage
      const grouped = stages.map((stage) => ({
        ...stage,
        deals: deals.filter((deal) => deal.etapa_id === stage.id),
        total: deals
          .filter((deal) => deal.etapa_id === stage.id)
          .reduce((sum, deal) => sum + (Number(deal.valor_estimado) || 0), 0),
      }));

      return grouped;
    },
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: DealInsert) => {
      const { data, error } = await supabase
        .from("orbit_deals")
        .insert(deal)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
    },
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: DealUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_deals")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
    },
  });
}

export function useMoveDealToStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deal_id, etapa_id, motivo_perda }: { deal_id: string; etapa_id: string; motivo_perda?: string }) => {
      const updates: DealUpdate = { etapa_id };
      if (motivo_perda) updates.motivo_perda = motivo_perda;

      const { data, error } = await supabase
        .from("orbit_deals")
        .update(updates)
        .eq("id", deal_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
    },
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_deals")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
    },
  });
}
