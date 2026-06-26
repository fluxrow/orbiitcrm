import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrbitLeadSource = {
  id: string;
  empresa_id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  secret_token: string;
  field_mapping: Record<string, string>;
  config: Record<string, any>;
  last_received_at: string | null;
  total_received: number;
  created_at: string;
  updated_at: string;
};

export const LEAD_SOURCE_TYPES = [
  { value: "typebot", label: "Typebot" },
  { value: "google_sheets", label: "Google Sheets" },
  { value: "webhook", label: "Webhook genérico" },
  { value: "form", label: "Formulário web" },
  { value: "outro", label: "Outro" },
] as const;

export const FIELD_MAPPING_TARGETS = [
  "nome",
  "telefone",
  "email",
  "documento",
  "origem",
  "observacoes",
] as const;

export function useOrbitLeadSources(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["orbit-lead-sources", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_lead_sources" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrbitLeadSource[];
    },
  });
}

export function useCreateLeadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      empresa_id: string;
      nome: string;
      tipo: string;
      field_mapping?: Record<string, string>;
      config?: Record<string, any>;
      ativo?: boolean;
    }) => {
      const { data, error } = await (supabase.from("orbit_lead_sources" as any) as any)
        .insert({
          empresa_id: input.empresa_id,
          nome: input.nome,
          tipo: input.tipo,
          field_mapping: input.field_mapping ?? {},
          config: input.config ?? {},
          ativo: input.ativo ?? true,
        })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as OrbitLeadSource;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-lead-sources"] }),
  });
}

export function useUpdateLeadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OrbitLeadSource> }) => {
      const { error } = await (supabase.from("orbit_lead_sources" as any) as any)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-lead-sources"] }),
  });
}

export function useDeleteLeadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orbit_lead_sources" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-lead-sources"] }),
  });
}

export function useRotateLeadSourceToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Gera token hex client-side (48 chars) — o backend tem default próprio, mas aqui forçamos rotação
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { error } = await (supabase.from("orbit_lead_sources" as any) as any)
        .update({ secret_token: token })
        .eq("id", id);
      if (error) throw error;
      return token;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-lead-sources"] }),
  });
}

export function buildLeadIngestEndpoint(sourceId: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/orbit-lead-ingest/${sourceId}`;
}
