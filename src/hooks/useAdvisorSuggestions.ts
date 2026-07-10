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
  action: {
    kind?: string;
    target_id?: string;
    hint?: string;
    template?: any;
    flow_id?: string | null;
    flow_name?: string | null;
    trigger_type?: string | null;
    stage_nome?: string | null;
    playbook_ok?: boolean;
    playbook_prefixes?: string[];
    depends_on_whatsapp?: boolean;
    depends_on_calendar?: boolean;
    zapi_available?: boolean;
    envio_real_liberado?: boolean;
    calendar_ready?: boolean;
    dry_run?: boolean;
    apply_gate_reasons?: string[];
  } | null;
  status: string;
  gerada_em: string;
  expires_at: string | null;
};

const APPLYABLE_KINDS = new Set([
  "flow_pause",
  "stage_add_followup_task",
  "flow_variation_propose",
]);

/**
 * Uma sugestão só é oferecida como "aplicável" quando:
 *  1. A action.kind está na whitelist e
 *  2. O scan não anexou nenhum `apply_gate_reasons` (playbook do tenant,
 *     dependência de Z-API sem `envio_real_liberado`, dependência de agenda
 *     sem Google Calendar conectado, fluxo fora do playbook, etc.).
 * Sugestões fora dessas condições continuam visíveis como DIAGNÓSTICO,
 * mas sem o botão "Aplicar".
 */
export function isApplyable(s: AdvisorSuggestion): boolean {
  const kind = String(s.action?.kind ?? "");
  if (!APPLYABLE_KINDS.has(kind)) return false;
  const reasons = s.action?.apply_gate_reasons;
  if (Array.isArray(reasons) && reasons.length > 0) return false;
  if (s.action?.playbook_ok === false) return false;
  if (s.action?.depends_on_whatsapp && s.action?.envio_real_liberado === false) return false;
  if (s.action?.depends_on_calendar && s.action?.calendar_ready === false) return false;
  return true;
}

export function getBlockReasons(s: AdvisorSuggestion): string[] {
  const reasons = s.action?.apply_gate_reasons;
  return Array.isArray(reasons) ? reasons : [];
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
