import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { useTenant } from "@/contexts/TenantContext";
import { getConversaOwnership, RELEASE_BLOCKED_CUTOFF_MESSAGE } from "@/lib/conversa-ownership";


type Conversa = Tables<"orbit_conversas">;
type ConversaUpdate = TablesUpdate<"orbit_conversas">;

export function useOrbitConversas(canal?: string, matchedIds?: string[]) {
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
    queryKey: ["orbit_conversas", empresaId, canal, matchedIds],
    enabled: !!empresaId,
    queryFn: async () => {
      if (matchedIds && matchedIds.length === 0) return [];
      let query = supabase
        .from("orbit_conversas")
        .select(`
          *,
          prospect:orbit_prospects!orbit_conversas_prospect_id_fkey(id, nome_razao, nome_fantasia, email_principal, segmento, deleted_at),
          human_user:profiles!orbit_conversas_human_user_id_fkey(id, nome)
        `)
        .eq("empresa_id", empresaId!)
        .eq("status", "aberta")
        // Quarentena/arquivamento: conversas arquivadas não aparecem na aba ativa
        .is("archived_at", null)
        .order("ultima_mensagem_at", { ascending: false, nullsFirst: false });


      if (canal && canal !== "all") {
        query = query.eq("canal", canal);
      }
      if (matchedIds) {
        query = query.in("id", matchedIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      // Prospects arquivados (deleted_at) também ficam fora da aba ativa
      return (data ?? []).filter((c: any) => !c.prospect?.deleted_at);
    },

  });
}

export function useOrbitConversa(id: string | undefined) {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_conversa", empresaId, id],
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
    enabled: !!empresaId && !!id,
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

/**
 * Assumir conversa: humano passa a ser o responsável.
 * Sempre grava human_talk=true + human_user_id do usuário autenticado, com escopo
 * de empresa (RLS). Nunca gera resposta: só troca a posse.
 */
export function useStartHumanTakeover() {
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();

  return useMutation({
    mutationFn: async ({ conversa_id, user_id }: { conversa_id: string; user_id?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || user_id || null;
      if (!uid) throw new Error("Sessão expirada: entre novamente para assumir a conversa.");

      let query = supabase
        .from("orbit_conversas")
        .update({ human_talk: true, human_user_id: uid, ai_processing: false })
        .eq("id", conversa_id);
      if (empresaId) query = query.eq("empresa_id", empresaId);

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orbit_conversas"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_conversa", variables.conversa_id] });
    },
  });
}

/**
 * Devolver para IA: operação ATÔMICA no backend (RPC tenant-scoped).
 * A RPC valida auth.uid, membership/empresa, modo automático e o corte
 * (auto_reply_new_leads_from), limpa posse humana + marcador histórico de handoff
 * e cancela debounce pendente. Não dispara resposta retroativa.
 */
export function useEndHumanTakeover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversa_id: string) => {
      const { data, error } = await supabase.rpc("orbit_release_conversa_to_ai", {
        p_conversa_id: conversa_id,
      });
      if (error) throw error;

      const result = (data ?? {}) as { ok?: boolean; error?: string };
      if (!result.ok) {
        const messages: Record<string, string> = {
          unauthenticated: "Sessão expirada: entre novamente para devolver a conversa.",
          forbidden: "Você não tem permissão para devolver esta conversa.",
          conversa_not_found: "Conversa não encontrada.",
          automatic_mode_off: "O modo automático da empresa está desligado.",
          before_automation_cutoff: RELEASE_BLOCKED_CUTOFF_MESSAGE,
        };
        throw new Error(messages[result.error ?? ""] ?? "Não foi possível devolver a conversa para a IA.");
      }
      return result;
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
