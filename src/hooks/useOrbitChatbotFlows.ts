import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface ChatbotFlowBranch {
  id: string;
  flow_id: string;
  nome: string | null;
  keywords: string[] | null;
  resposta_texto: string | null;
  resposta_audio_id: string | null;
  encerrar_fluxo: boolean;
  ordem: number;
}

export interface ChatbotFlow {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  trigger_keywords: string[];
  trigger_modo: "contains" | "exact";
  passo1_texto: string | null;
  passo1_audio_id: string | null;
  passo1_aguardar_resposta: boolean;
  ativo: boolean;
  prioridade: number;
  uso_count: number;
  created_at: string;
  branches?: ChatbotFlowBranch[];
}

export function useOrbitChatbotFlows() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_chatbot_flows", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data: flows, error } = await (supabase as any)
        .from("orbit_chatbot_flows")
        .select("*, branches:orbit_chatbot_flow_branches(*)")
        .eq("empresa_id", empresaId!)
        .order("prioridade", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (flows ?? []) as ChatbotFlow[];
    },
  });
}

export function useCreateChatbotFlow() {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      nome: string;
      descricao?: string;
      trigger_keywords: string[];
      trigger_modo?: "contains" | "exact";
      passo1_texto?: string;
      passo1_audio_id?: string | null;
      passo1_aguardar_resposta?: boolean;
      prioridade?: number;
      branches: Array<{
        nome?: string;
        keywords: string[] | null;
        resposta_texto?: string;
        resposta_audio_id?: string | null;
        encerrar_fluxo?: boolean;
        ordem?: number;
      }>;
    }) => {
      const { branches, ...flowData } = payload;
      const { data: flow, error } = await (supabase as any)
        .from("orbit_chatbot_flows")
        .insert({ ...flowData, empresa_id: empresaId })
        .select()
        .single();
      if (error) throw error;
      if (branches.length > 0) {
        const { error: brError } = await (supabase as any)
          .from("orbit_chatbot_flow_branches")
          .insert(branches.map((b, i) => ({ ...b, flow_id: flow.id, ordem: b.ordem ?? i })));
        if (brError) throw brError;
      }
      return flow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_chatbot_flows", empresaId] }),
  });
}

export function useUpdateChatbotFlow() {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      branches,
      ...data
    }: Partial<ChatbotFlow> & { id: string; branches?: Array<Partial<ChatbotFlowBranch>> }) => {
      const { error } = await (supabase as any)
        .from("orbit_chatbot_flows")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      if (branches !== undefined) {
        await (supabase as any).from("orbit_chatbot_flow_branches").delete().eq("flow_id", id);
        if (branches.length > 0) {
          await (supabase as any).from("orbit_chatbot_flow_branches").insert(
            branches.map((b, i) => {
              const { id: _ignore, flow_id: _ignore2, created_at: _ignore3, ...rest } = b as any;
              return { ...rest, flow_id: id, ordem: rest.ordem ?? i };
            })
          );
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_chatbot_flows", empresaId] }),
  });
}

export function useDeleteChatbotFlow() {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("orbit_chatbot_flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_chatbot_flows", empresaId] }),
  });
}

export function useToggleChatbotFlow() {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await (supabase as any)
        .from("orbit_chatbot_flows")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_chatbot_flows", empresaId] }),
  });
}
