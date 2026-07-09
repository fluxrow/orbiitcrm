import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface AudioClip {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  url: string;
  storage_path: string | null;
  duracao_ms: number | null;
  contexto: string;
  tags: string[];
  ativo: boolean;
  uso_count: number;
  created_at: string;
}

export const AUDIO_CONTEXTOS = [
  { value: "apresentacao", label: "Apresentação" },
  { value: "qualificacao", label: "Qualificação" },
  { value: "preco", label: "Preço / Orçamento" },
  { value: "agendamento", label: "Agendamento" },
  { value: "objecao_tempo", label: "Objeção: Sem tempo" },
  { value: "objecao_interesse", label: "Objeção: Sem interesse" },
  { value: "encerramento", label: "Encerramento" },
  { value: "custom", label: "Personalizado" },
] as const;

export function useOrbitAudioLibrary() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_audio_library", empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from("orbit_audio_library" as any)
        .select("*")
        .eq("empresa_id", empresaId)
        .order("contexto", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AudioClip[];
    },
    enabled: !!empresaId,
  });
}

export function useCreateAudioClip() {
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (payload: {
      nome: string;
      descricao?: string;
      url?: string;
      storage_path?: string;
      duracao_ms?: number;
      contexto: string;
      tags?: string[];
    }) => {
      if (!empresaId) throw new Error("empresaId ausente");
      const { data, error } = await supabase
        .from("orbit_audio_library" as any)
        .insert({ ...payload, empresa_id: empresaId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_audio_library", empresaId] });
      toast.success("Áudio adicionado à biblioteca");
    },
    onError: () => toast.error("Erro ao salvar áudio"),
  });
}

export function useDeleteAudioClip() {
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_audio_library" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_audio_library", empresaId] });
      toast.success("Áudio removido");
    },
    onError: () => toast.error("Erro ao remover áudio"),
  });
}

export function useToggleAudioClip() {
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("orbit_audio_library" as any)
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_audio_library", empresaId] });
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });
}
