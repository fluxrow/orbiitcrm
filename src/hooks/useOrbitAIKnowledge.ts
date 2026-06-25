import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AIKnowledgeRow {
  id: string;
  empresa_id: string;
  source_id: string;
  tipo: "documento" | "url" | "texto";
  titulo: string | null;
  source_url: string | null;
  storage_path: string | null;
  conteudo_texto: string | null;
  chunk_index: number;
  ativo: boolean;
  status: "pending" | "processing" | "ready" | "error";
  erro: string | null;
  created_at: string;
  updated_at: string;
}

// Lista uma linha por source (chunk_index = 0)
export function useOrbitAIKnowledge(empresaId?: string | null) {
  return useQuery({
    queryKey: ["orbit_ai_knowledge", empresaId],
    queryFn: async () => {
      if (!empresaId) return [] as AIKnowledgeRow[];
      const { data, error } = await supabase
        .from("orbit_ai_knowledge" as any)
        .select(
          "id, empresa_id, source_id, tipo, titulo, source_url, storage_path, conteudo_texto, chunk_index, ativo, status, erro, created_at, updated_at",
        )
        .eq("empresa_id", empresaId)
        .eq("chunk_index", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AIKnowledgeRow[];
    },
    enabled: !!empresaId,
    refetchInterval: (q) => {
      const rows = (q.state.data as AIKnowledgeRow[] | undefined) || [];
      return rows.some((r) => r.status === "pending" || r.status === "processing") ? 3000 : false;
    },
  });
}

async function callIngest(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("orbit-knowledge-ingest", { body });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { ok: boolean; source_id: string };
}

export function useIngestKnowledgeText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { empresa_id: string; titulo?: string; conteudo_texto: string }) =>
      callIngest({ empresa_id: input.empresa_id, tipo: "texto", titulo: input.titulo, conteudo_texto: input.conteudo_texto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_ai_knowledge"] }),
  });
}

export function useIngestKnowledgeUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { empresa_id: string; source_url: string; titulo?: string }) =>
      callIngest({ empresa_id: input.empresa_id, tipo: "url", source_url: input.source_url, titulo: input.titulo || input.source_url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_ai_knowledge"] }),
  });
}

export function useUploadKnowledgeDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { empresa_id: string; file: File; titulo?: string }) => {
      const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
      const sourceId = crypto.randomUUID();
      const path = `${input.empresa_id}/${sourceId}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("orbit-knowledge-base")
        .upload(path, input.file, { contentType: input.file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;
      return callIngest({
        empresa_id: input.empresa_id,
        tipo: "documento",
        storage_path: path,
        titulo: input.titulo || input.file.name,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_ai_knowledge"] }),
  });
}

export function useReprocessKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { empresa_id: string; source_id: string; tipo: AIKnowledgeRow["tipo"] }) =>
      callIngest({ empresa_id: input.empresa_id, tipo: input.tipo, reprocess_source_id: input.source_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_ai_knowledge"] }),
  });
}

export function useToggleKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { source_id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("orbit_ai_knowledge" as any)
        .update({ ativo: input.ativo })
        .eq("source_id", input.source_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_ai_knowledge"] }),
  });
}

export function useDeleteKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { source_id: string; storage_path?: string | null }) => {
      if (input.storage_path) {
        await supabase.storage.from("orbit-knowledge-base").remove([input.storage_path]);
      }
      const { error } = await supabase
        .from("orbit_ai_knowledge" as any)
        .delete()
        .eq("source_id", input.source_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_ai_knowledge"] }),
  });
}
