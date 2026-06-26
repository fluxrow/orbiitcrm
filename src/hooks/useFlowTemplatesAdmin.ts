import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrbitFlowTemplate } from "./useOrbitFlows";

export function useAllFlowTemplates() {
  return useQuery({
    queryKey: ["orbit-flow-templates-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_flow_templates" as any)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrbitFlowTemplate[];
    },
  });
}

type UpsertInput = {
  id?: string;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  definicao: any;
  ativo?: boolean;
  is_global?: boolean;
};

export function useUpsertFlowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertInput) => {
      const payload = {
        nome: input.nome,
        descricao: input.descricao ?? null,
        categoria: input.categoria ?? null,
        definicao: input.definicao ?? {},
        ativo: input.ativo ?? true,
        is_global: input.is_global ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("orbit_flow_templates" as any)
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("orbit_flow_templates" as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit-flow-templates-admin"] });
      qc.invalidateQueries({ queryKey: ["orbit-flow-templates"] });
    },
  });
}

export function useDeleteFlowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_flow_templates" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit-flow-templates-admin"] });
      qc.invalidateQueries({ queryKey: ["orbit-flow-templates"] });
    },
  });
}

export function useToggleFlowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("orbit_flow_templates" as any)
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit-flow-templates-admin"] });
      qc.invalidateQueries({ queryKey: ["orbit-flow-templates"] });
    },
  });
}
