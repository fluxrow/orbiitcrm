import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { isTenantFeatureEnabled } from "@/lib/tenant-explicit-mutations";

export const TENANT_PIPELINE_STAGES_WAVE2_FLAG = "tenant_pipeline_stages_wave2_v1" as const;

export interface StageArchiveImpact {
  stage_id: string;
  active_deals: number;
  active_flow_actions: number;
  active_flow_configs: number;
  active_flow_versions: number;
  active_scheduled_actions: number;
  can_archive: boolean;
}

export interface PipelineStage {
  id: string;
  empresa_id: string | null;
  nome: string;
  descricao: string | null;
  slug: string | null;
  ordem: number;
  cor: string | null;
  is_won: boolean | null;
  is_lost: boolean | null;
  probabilidade_default: number | null;
  sla_dias: number | null;
  requer_motivo: boolean;
  automacoes_config: any;
  ai_config: any;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineTemplate {
  id: string;
  empresa_id: string | null;
  nome: string;
  descricao: string | null;
  vertical: string | null;
  stages: any[];
  is_system: boolean;
  created_at: string;
}

export function usePipelineStages() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_pipeline_stages_full", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_pipeline_stages")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("is_archived", false)
        .order("ordem");
      if (error) throw error;
      return (data || []) as unknown as PipelineStage[];
    },
  });
}

export function usePipelineTemplates() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_pipeline_templates", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_pipeline_templates" as any)
        .select("*")
        .order("is_system", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data || []) as unknown as PipelineTemplate[];
    },
  });
}

export function useUpsertStage() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (stage: Partial<PipelineStage> & { nome: string }) => {
      if (!empresaId || !slug) throw new Error("TENANT_CONTEXT_MISSING");
      const { id, empresa_id: _empresaId, created_at: _createdAt, updated_at: _updatedAt,
        is_archived: _isArchived, slug: _stageSlug, ...stageFields } = stage;
      if (await isTenantFeatureEnabled(empresaId, TENANT_PIPELINE_STAGES_WAVE2_FLAG)) {
        const { error } = await supabase.rpc("orbit_tenant_pipeline_stage_mutate_scoped", {
          p_tenant_slug: slug,
          p_action_type: id ? "update_stage" : "create_stage",
          p_stage_id: id ?? undefined,
          p_payload: stageFields,
        });
        if (error) throw error;
        return;
      }
      const payload: any = { ...stage, empresa_id: empresaId };
      if (stage.id) {
        const { error } = await supabase
          .from("orbit_pipeline_stages")
          .update(payload)
          .eq("id", stage.id)
          .eq("empresa_id", empresaId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("orbit_pipeline_stages")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages_full"] });
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages"] });
      toast.success("Etapa salva");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar etapa"),
  });
}

export function useArchiveStage() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!empresaId || !slug) throw new Error("TENANT_CONTEXT_MISSING");
      if (await isTenantFeatureEnabled(empresaId, TENANT_PIPELINE_STAGES_WAVE2_FLAG)) {
        const { error } = await supabase.rpc("orbit_tenant_pipeline_stage_mutate_scoped", {
          p_tenant_slug: slug,
          p_action_type: "archive_stage",
          p_stage_id: id,
          p_payload: {},
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("orbit_pipeline_stages")
        .update({ is_archived: true } as any)
        .eq("id", id)
        .eq("empresa_id", empresaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages_full"] });
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages"] });
      toast.success("Etapa arquivada");
    },
    onError: (e: any) => toast.error(e.message || "Erro"),
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!empresaId || !slug) throw new Error("TENANT_CONTEXT_MISSING");
      if (await isTenantFeatureEnabled(empresaId, TENANT_PIPELINE_STAGES_WAVE2_FLAG)) {
        const { error } = await supabase.rpc("orbit_tenant_pipeline_stage_mutate_scoped", {
          p_tenant_slug: slug,
          p_action_type: "reorder_stages",
          p_stage_id: undefined,
          p_payload: { ordered_ids: orderedIds },
        });
        if (error) throw error;
        return;
      }
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from("orbit_pipeline_stages").update({ ordem: idx + 1 } as any)
            .eq("id", id).eq("empresa_id", empresaId)
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages_full"] });
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages"] });
    },
  });
}

export function useStageArchiveImpact(stageId: string | undefined) {
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["pipeline-stage-impact", empresaId, slug, stageId],
    enabled: !!empresaId && !!slug && !!stageId,
    staleTime: 5_000,
    retry: false,
    queryFn: async (): Promise<StageArchiveImpact | null> => {
      if (!await isTenantFeatureEnabled(empresaId!, TENANT_PIPELINE_STAGES_WAVE2_FLAG)) {
        return null;
      }
      const { data, error } = await supabase.rpc("orbit_tenant_pipeline_stage_impact_scoped", {
        p_tenant_slug: slug!,
        p_stage_id: stageId!,
      });
      if (error) throw error;
      return ((data as any)?.data ?? null) as StageArchiveImpact | null;
    },
  });
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async ({ templateId, replace }: { templateId: string; replace: boolean }) => {
      if (!empresaId) throw new Error("empresa_required");
      if (replace && await isTenantFeatureEnabled(empresaId, TENANT_PIPELINE_STAGES_WAVE2_FLAG)) {
        throw new Error("Substituição bloqueada: revise e arquive cada etapa com a análise de impacto.");
      }
      const { data, error } = await supabase.rpc("apply_pipeline_template" as any, {
        p_empresa_id: empresaId,
        p_template_id: templateId,
        p_replace: replace,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages_full"] });
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages"] });
      toast.success(`Template aplicado — ${data?.inserted ?? 0} etapas criadas`);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao aplicar template"),
  });
}
