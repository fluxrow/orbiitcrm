import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { Tables } from "@/integrations/supabase/types";

export type OrbitTag = Tables<"orbit_tags">;

export const TAG_COLORS = [
  "#f9b217",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#64748b",
] as const;

/** Validação de nome espelhando o CHECK do banco (1..40 chars). */
export function validateTagName(nome: string): string | null {
  const clean = nome.trim();
  if (clean.length < 1) return "Informe o nome da tag";
  if (clean.length > 40) return "Máximo de 40 caracteres";
  return null;
}

export function isValidTagColor(cor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(cor);
}

/** Tags do tenant (isolamento por empresa_id em toda query). */
export function useOrbitTags() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_tags", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_tags")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as OrbitTag[];
    },
  });
}

export function useCreateTag() {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, cor }: { nome: string; cor: string }) => {
      if (!empresaId) throw new Error("Empresa não identificada");
      const nameError = validateTagName(nome);
      if (nameError) throw new Error(nameError);
      if (!isValidTagColor(cor)) throw new Error("Cor inválida");

      const { data, error } = await supabase
        .from("orbit_tags")
        .insert({ empresa_id: empresaId, nome: nome.trim(), cor })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505" || error.code === "23P01" || /duplicate|unique/i.test(error.message)) {
          throw new Error("Já existe uma tag com esse nome");
        }
        throw error;
      }
      return data as OrbitTag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_tags", empresaId] }),
  });
}

export function useUpdateTag() {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nome, cor }: { id: string; nome?: string; cor?: string }) => {
      const patch: { nome?: string; cor?: string } = {};
      if (nome !== undefined) {
        const nameError = validateTagName(nome);
        if (nameError) throw new Error(nameError);
        patch.nome = nome.trim();
      }
      if (cor !== undefined) {
        if (!isValidTagColor(cor)) throw new Error("Cor inválida");
        patch.cor = cor;
      }
      const { error } = await supabase
        .from("orbit_tags")
        .update(patch)
        .eq("id", id)
        .eq("empresa_id", empresaId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit_tags", empresaId] }),
  });
}

export function useDeleteTag() {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_tags")
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresaId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit_tags", empresaId] });
      qc.invalidateQueries({ queryKey: ["orbit_prospect_tags"] });
    },
  });
}

/** Tags atribuídas a um prospect. */
export function useProspectTags(prospectId: string | null | undefined) {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_prospect_tags", empresaId, prospectId],
    enabled: !!empresaId && !!prospectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_prospect_tags")
        .select("id, tag_id, tag:orbit_tags(id, nome, cor)")
        .eq("empresa_id", empresaId!)
        .eq("prospect_id", prospectId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; tag_id: string; tag: Pick<OrbitTag, "id" | "nome" | "cor"> | null }>;
    },
  });
}

export function useToggleProspectTag(prospectId: string | null | undefined) {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, attach }: { tagId: string; attach: boolean }) => {
      if (!empresaId || !prospectId) throw new Error("Prospect não identificado");
      if (attach) {
        const { error } = await supabase
          .from("orbit_prospect_tags")
          .insert({ empresa_id: empresaId, prospect_id: prospectId, tag_id: tagId });
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      } else {
        const { error } = await supabase
          .from("orbit_prospect_tags")
          .delete()
          .eq("empresa_id", empresaId)
          .eq("prospect_id", prospectId)
          .eq("tag_id", tagId);
        if (error) throw error;
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["orbit_prospect_tags", empresaId, prospectId] }),
  });
}
