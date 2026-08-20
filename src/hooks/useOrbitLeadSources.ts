import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { isTenantFeatureEnabled } from "@/lib/tenant-explicit-mutations";

export const TENANT_LEAD_SOURCES_WAVE3_FLAG =
  "tenant_lead_sources_wave3_v1" as const;

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
  deleted_at: string | null;
};

export const LEAD_SOURCE_TYPES = [
  { value: "typebot", label: "Typebot" },
  { value: "google_sheets", label: "Google Sheets" },
  { value: "webhook_generico", label: "Webhook genérico" },
  { value: "form_publico", label: "Formulário web" },
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
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrbitLeadSource[];
    },
  });
}

export function useCreateLeadSource() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (input: {
      empresa_id: string;
      nome: string;
      tipo: string;
      field_mapping?: Record<string, string>;
      config?: Record<string, any>;
      ativo?: boolean;
    }) => {
      if (!empresaId || !slug) throw new Error("TENANT_CONTEXT_MISSING");
      if (await isTenantFeatureEnabled(empresaId, TENANT_LEAD_SOURCES_WAVE3_FLAG)) {
        const { data, error } = await supabase.rpc("orbit_tenant_lead_source_mutate_scoped", {
          p_tenant_slug: slug,
          p_action_type: "create_lead_source",
          p_payload: {
            nome: input.nome,
            tipo: input.tipo,
            field_mapping: input.field_mapping ?? {},
            config: input.config ?? {},
            ativo: input.ativo ?? true,
          },
        });
        if (error) throw error;
        return (data as any)?.data?.source as OrbitLeadSource;
      }
      const { data, error } = await (supabase.from("orbit_lead_sources" as any) as any)
        .insert({
          empresa_id: empresaId,
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
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OrbitLeadSource> }) => {
      if (!empresaId || !slug) throw new Error("TENANT_CONTEXT_MISSING");
      const safePatch = {
        ...(patch.nome !== undefined ? { nome: patch.nome } : {}),
        ...(patch.ativo !== undefined ? { ativo: patch.ativo } : {}),
        ...(patch.field_mapping !== undefined ? { field_mapping: patch.field_mapping } : {}),
        ...(patch.config !== undefined ? { config: patch.config } : {}),
      };
      if (await isTenantFeatureEnabled(empresaId, TENANT_LEAD_SOURCES_WAVE3_FLAG)) {
        const { error } = await supabase.rpc("orbit_tenant_lead_source_mutate_scoped", {
          p_tenant_slug: slug, p_action_type: "update_lead_source",
          p_source_id: id, p_payload: safePatch,
        });
        if (error) throw error;
        return;
      }
      const { error } = await (supabase.from("orbit_lead_sources" as any) as any)
        .update(safePatch)
        .eq("id", id)
        .eq("empresa_id", empresaId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-lead-sources"] }),
  });
}

export function useDeleteLeadSource() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!empresaId || !slug) throw new Error("TENANT_CONTEXT_MISSING");
      if (await isTenantFeatureEnabled(empresaId, TENANT_LEAD_SOURCES_WAVE3_FLAG)) {
        const { error } = await supabase.rpc("orbit_tenant_lead_source_mutate_scoped", {
          p_tenant_slug: slug, p_action_type: "archive_lead_source",
          p_source_id: id, p_payload: {},
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("orbit_lead_sources" as any).delete()
        .eq("id", id).eq("empresa_id", empresaId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-lead-sources"] }),
  });
}

export function useRotateLeadSourceToken() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!empresaId || !slug) throw new Error("TENANT_CONTEXT_MISSING");
      if (await isTenantFeatureEnabled(empresaId, TENANT_LEAD_SOURCES_WAVE3_FLAG)) {
        const { data, error } = await supabase.rpc("orbit_tenant_lead_source_mutate_scoped", {
          p_tenant_slug: slug, p_action_type: "rotate_lead_source_token",
          p_source_id: id, p_payload: {},
        });
        if (error) throw error;
        return (data as any)?.data?.source?.secret_token as string;
      }
      // Legacy fallback for tenants outside the canary.
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { error } = await (supabase.from("orbit_lead_sources" as any) as any)
        .update({ secret_token: token })
        .eq("id", id)
        .eq("empresa_id", empresaId);
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
