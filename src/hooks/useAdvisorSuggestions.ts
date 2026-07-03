import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export type AdvisorSuggestion = {
  id: string;
  tipo: string;
  titulo: string;
  racional: string;
  risco: "baixo" | "medio" | "alto";
  action: { kind?: string; target_id?: string; hint?: string; template?: any } | null;
  status: string;
  gerada_em: string;
  expires_at: string | null;
};

const APPLYABLE_KINDS = new Set([
  "flow_pause",
  "stage_add_followup_task",
  "flow_variation_propose",
]);

export function isApplyable(s: AdvisorSuggestion): boolean {
  return APPLYABLE_KINDS.has(String(s.action?.kind ?? ""));
}

export function useAdvisorSuggestions() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["advisor-suggestions", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_advisor_suggestions")
        .select("id, tipo, titulo, racional, risco, action, status, gerada_em, expires_at")
        .eq("empresa_id", empresaId!)
        .eq("status", "pending")
        .order("gerada_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AdvisorSuggestion[];
    },
    staleTime: 30_000,
  });
}

async function callApply(suggestionId: string, confirm: boolean) {
  const { data, error } = await supabase.functions.invoke("orbit-advisor-apply", {
    body: { suggestion_id: suggestionId, confirm },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "apply_failed");
  return data.data;
}

export function useAdvisorApplyPreview() {
  return useMutation({
    mutationFn: (suggestionId: string) => callApply(suggestionId, false),
  });
}

export function useAdvisorApplyConfirm() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: (suggestionId: string) => callApply(suggestionId, true),
    onSuccess: () => {
      toast.success("Sugestão aplicada");
      qc.invalidateQueries({ queryKey: ["advisor-suggestions", empresaId] });
    },
    onError: (e: any) => toast.error(`Falha ao aplicar: ${e?.message ?? "erro"}`),
  });
}
