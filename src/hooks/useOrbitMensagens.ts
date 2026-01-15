import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Mensagem = Tables<"orbit_mensagens">;

export function useOrbitMensagens(conversa_id: string | undefined) {
  const queryClient = useQueryClient();

  // Real-time subscription
  useEffect(() => {
    if (!conversa_id) return;

    const channel = supabase
      .channel(`orbit_mensagens_${conversa_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orbit_mensagens",
          filter: `conversa_id=eq.${conversa_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["orbit_mensagens", conversa_id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversa_id, queryClient]);

  return useQuery({
    queryKey: ["orbit_mensagens", conversa_id],
    queryFn: async () => {
      if (!conversa_id) return [];
      const { data, error } = await supabase
        .from("orbit_mensagens")
        .select("*")
        .eq("conversa_id", conversa_id)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!conversa_id,
  });
}

export function useSendMensagem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversa_id,
      mensagem,
      telefone,
      canal = "whatsapp",
    }: {
      conversa_id: string;
      mensagem: string;
      telefone?: string;
      canal?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("orbit-send-message", {
        body: { conversa_id, mensagem, telefone, canal },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orbit_mensagens", variables.conversa_id] });
      queryClient.invalidateQueries({ queryKey: ["orbit_conversas"] });
    },
  });
}

export function useGetAISuggestions() {
  return useMutation({
    mutationFn: async ({
      conversa_id,
      prospect_id,
      ultima_mensagem,
    }: {
      conversa_id: string;
      prospect_id: string;
      ultima_mensagem: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("orbit-ai-suggest", {
        body: { conversa_id, prospect_id, ultima_mensagem },
      });

      if (response.error) throw response.error;
      return response.data;
    },
  });
}
