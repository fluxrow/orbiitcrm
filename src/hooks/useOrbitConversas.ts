import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";

type Conversa = Tables<"orbit_conversas">;
type ConversaUpdate = TablesUpdate<"orbit_conversas">;

export function useOrbitConversas(canal?: string) {
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("orbit_conversas_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orbit_conversas",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["orbit_conversas"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["orbit_conversas", canal],
    queryFn: async () => {
      let query = supabase
        .from("orbit_conversas")
        .select(`
          *,
          prospect:orbit_prospects!orbit_conversas_prospect_id_fkey(id, nome_razao, nome_fantasia, email_principal, segmento),
          human_user:profiles!orbit_conversas_human_user_id_fkey(id, nome)
        `)
        .eq("status", "aberta")
        .order("ultima_mensagem_at", { ascending: false, nullsFirst: false });

      if (canal && canal !== "all") {
        query = query.eq("canal", canal);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useOrbitConversa(id: string | undefined) {
  return useQuery({
    queryKey: ["orbit_conversa", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("orbit_conversas")
        .select(`
          *,
          prospect:orbit_prospects!orbit_conversas_prospect_id_fkey(*),
          human_user:profiles!orbit_conversas_human_user_id_fkey(id, nome)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useUpdateConversa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ConversaUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_conversas")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orbit_conversas"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_conversa", variables.id] });
    },
  });
}

export function useStartHumanTakeover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversa_id, user_id }: { conversa_id: string; user_id: string }) => {
      const { data, error } = await supabase
        .from("orbit_conversas")
        .update({
          human_talk: true,
          human_user_id: user_id,
        })
        .eq("id", conversa_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orbit_conversas"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_conversa", variables.conversa_id] });
    },
  });
}

export function useEndHumanTakeover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversa_id: string) => {
      const { data, error } = await supabase
        .from("orbit_conversas")
        .update({
          human_talk: false,
          human_user_id: null,
        })
        .eq("id", conversa_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, conversa_id) => {
      queryClient.invalidateQueries({ queryKey: ["orbit_conversas"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_conversa", conversa_id] });
    },
  });
}

export function useMarkConversaAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversa_id: string) => {
      const { error } = await supabase
        .from("orbit_conversas")
        .update({ mensagens_nao_lidas: 0 })
        .eq("id", conversa_id);
      if (error) throw error;
    },
    onSuccess: (_, conversa_id) => {
      queryClient.invalidateQueries({ queryKey: ["orbit_conversas"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_conversa", conversa_id] });
    },
  });
}
