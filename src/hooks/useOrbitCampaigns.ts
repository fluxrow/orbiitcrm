import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { orbitCampaignKeys } from "@/lib/query-keys";
import { useTenant } from "@/contexts/TenantContext";


type Campaign = Tables<"orbit_campaigns">;
type CampaignInsert = TablesInsert<"orbit_campaigns">;
type CampaignUpdate = TablesUpdate<"orbit_campaigns">;

interface CampaignFilters {
  status?: string;
  canal?: string;
}

export function useOrbitCampaigns(filters?: CampaignFilters) {
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();

  useEffect(() => {
    const channel = supabase
      .channel("orbit_campaigns_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orbit_campaigns" },
        () => {
          queryClient.invalidateQueries({ queryKey: orbitCampaignKeys.all });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orbit_campaign_recipients" },
        () => {
          queryClient.invalidateQueries({ queryKey: orbitCampaignKeys.counts() });
          queryClient.invalidateQueries({ queryKey: orbitCampaignKeys.all });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: orbitCampaignKeys.list(filters, empresaId),
    enabled: !!empresaId,
    queryFn: async () => {
      let query = supabase
        .from("orbit_campaigns")
        .select("*, template:orbit_message_templates(id, nome, canal, corpo_texto, imagem_url, assunto_email)")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false });


      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      if (filters?.canal && filters.canal !== "all") {
        query = query.eq("canal", filters.canal);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: CampaignInsert) => {
      const { data, error } = await supabase
        .from("orbit_campaigns")
        .insert(campaign)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitCampaignKeys.all });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: CampaignUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_campaigns")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitCampaignKeys.all });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_campaigns")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitCampaignKeys.all });
    },
  });
}
