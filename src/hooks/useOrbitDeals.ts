import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { orbitProspectKeys } from "@/lib/query-keys";

type Deal = Tables<"orbit_deals">;
type DealInsert = TablesInsert<"orbit_deals">;
type DealUpdate = TablesUpdate<"orbit_deals">;

function recalculateStageTotal(stage: any) {
  return (stage.deals || []).reduce(
    (sum: number, deal: any) => sum + (Number(deal.valor_estimado) || 0),
    0,
  );
}

function replaceDealInList(deals: any[] | undefined, updatedDeal: any) {
  if (!deals) return deals;
  return deals.map((deal) => (deal.id === updatedDeal.id ? { ...deal, ...updatedDeal } : deal));
}

function replaceDealInGroupedStages(stages: any[] | undefined, updatedDeal: any) {
  if (!stages) return stages;

  const originalDeal = stages
    .flatMap((stage) => stage.deals || [])
    .find((deal) => deal.id === updatedDeal.id);

  return stages.map((stage) => {
    const remainingDeals = (stage.deals || []).filter((deal: any) => deal.id !== updatedDeal.id);
    const nextDeals =
      stage.id === updatedDeal.etapa_id
        ? [{ ...(originalDeal || {}), ...updatedDeal }, ...remainingDeals]
        : remainingDeals;

    return {
      ...stage,
      deals: nextDeals,
      total: recalculateStageTotal({ deals: nextDeals }),
    };
  });
}

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
          prospect:orbit_prospects!orbit_deals_prospect_id_fkey(id, nome_razao, nome_fantasia, telefone, whatsapp, email_principal, status_qualificacao),
          etapa:orbit_pipeline_stages!orbit_deals_etapa_id_fkey(id, nome, cor, is_won, is_lost),
          responsavel:profiles!orbit_deals_responsavel_id_fkey(id, nome)
        `)
        .is("deleted_at", null)
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
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("orbit_deals_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orbit_deals" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
          queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["orbit_deals_grouped"],
    queryFn: async () => {
      const [stagesResult, dealsResult] = await Promise.all([
        supabase
          .from("orbit_pipeline_stages")
          .select("*")
          .order("ordem", { ascending: true }),
        supabase
          .from("orbit_deals")
          .select(`
            *,
            prospect:orbit_prospects!orbit_deals_prospect_id_fkey(id, nome_razao, nome_fantasia, telefone, whatsapp, email_principal, status_qualificacao),
            responsavel:profiles!orbit_deals_responsavel_id_fkey(id, nome)
          `)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      ]);

      const { data: stages, error: stagesError } = stagesResult;
      const { data: deals, error: dealsError } = dealsResult;

      if (stagesError) throw stagesError;
      if (dealsError) throw dealsError;

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
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ["orbit_deals"] });
      await queryClient.cancelQueries({ queryKey: ["orbit_deals_grouped"] });

      const previousDeals = queryClient.getQueriesData({ queryKey: ["orbit_deals"] });
      const previousGrouped = queryClient.getQueryData(["orbit_deals_grouped"]);

      for (const [key, deals] of previousDeals) {
        queryClient.setQueryData(key, replaceDealInList(deals as any[] | undefined, { id, ...updates }));
      }

      queryClient.setQueryData(
        ["orbit_deals_grouped"],
        replaceDealInGroupedStages(previousGrouped as any[] | undefined, { id, ...updates }),
      );

      return { previousDeals, previousGrouped };
    },
    onError: (_error, _variables, context) => {
      context?.previousDeals?.forEach(([key, value]) => {
        queryClient.setQueryData(key, value);
      });
      queryClient.setQueryData(["orbit_deals_grouped"], context?.previousGrouped);
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
      const updates: any = { etapa_id, moved_at: new Date().toISOString() };
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
    onMutate: async ({ deal_id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ["orbit_deals"] });
      await queryClient.cancelQueries({ queryKey: ["orbit_deals_grouped"] });

      const patch = {
        id: deal_id,
        ...updates,
        moved_at: new Date().toISOString(),
      };

      const previousDeals = queryClient.getQueriesData({ queryKey: ["orbit_deals"] });
      const previousGrouped = queryClient.getQueryData(["orbit_deals_grouped"]);

      for (const [key, deals] of previousDeals) {
        queryClient.setQueryData(key, replaceDealInList(deals as any[] | undefined, patch));
      }

      queryClient.setQueryData(
        ["orbit_deals_grouped"],
        replaceDealInGroupedStages(previousGrouped as any[] | undefined, patch),
      );

      return { previousDeals, previousGrouped };
    },
    onError: (_error, _variables, context) => {
      context?.previousDeals?.forEach(([key, value]) => {
        queryClient.setQueryData(key, value);
      });
      queryClient.setQueryData(["orbit_deals_grouped"], context?.previousGrouped);
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
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
    },
  });
}

export function useConvertDealToClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deal_id, prospect_id, etapa_id }: { deal_id: string; prospect_id: string; etapa_id: string }) => {
      // Update deal status
      const { error: dealError } = await supabase
        .from("orbit_deals")
        .update({
          etapa_id,
          status: "won",
          data_conversao: new Date().toISOString(),
          moved_at: new Date().toISOString(),
        })
        .eq("id", deal_id);
      if (dealError) throw dealError;

      // Update prospect to cliente
      const { error: prospectError } = await supabase
        .from("orbit_prospects")
        .update({ status_qualificacao: "cliente" })
        .eq("id", prospect_id);
      if (prospectError) throw prospectError;

      // Register event
      const { data: deal } = await supabase
        .from("orbit_deals")
        .select("empresa_id")
        .eq("id", deal_id)
        .single();

      if (deal?.empresa_id) {
        await supabase.from("prospect_events" as any).insert({
          prospect_id,
          empresa_id: deal.empresa_id,
          tipo: "status_changed",
          titulo: "Prospect convertido em cliente",
          descricao: "Oportunidade marcada como ganha no funil comercial",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.all });
    },
  });
}

export function useUpdateDealChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deal_id, checklist }: { deal_id: string; checklist: any[] }) => {
      const { error } = await supabase
        .from("orbit_deals")
        .update({ documentos_checklist: checklist })
        .eq("id", deal_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_deals"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_deals_grouped"] });
    },
  });
}
