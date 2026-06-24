import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

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
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (stage: Partial<PipelineStage> & { nome: string }) => {
      if (!empresaId) throw new Error("empresa_required");
      const payload: any = { ...stage, empresa_id: empresaId };
      if (stage.id) {
        const { error } = await supabase
          .from("orbit_pipeline_stages")
          .update(payload)
          .eq("id", stage.id);
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
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_pipeline_stages")
        .update({ is_archived: true } as any)
        .eq("id", id);
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
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from("orbit_pipeline_stages").update({ ordem: idx + 1 } as any).eq("id", id)
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages_full"] });
      qc.invalidateQueries({ queryKey: ["orbit_pipeline_stages"] });
    },
  });
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async ({ templateId, replace }: { templateId: string; replace: boolean }) => {
      if (!empresaId) throw new Error("empresa_required");
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
