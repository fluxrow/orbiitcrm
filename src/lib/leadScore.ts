import { supabase } from "@/integrations/supabase/client";

export type LeadScoreLabel = "cold" | "warm" | "hot" | "priority" | string;

export interface LeadScoreResult {
  ok: boolean;
  skipped?: string;
  score?: number;
  label?: LeadScoreLabel;
  reasons?: Array<{ id: string; weight?: number; override_min_label?: string }>;
  version?: number;
}

/**
 * Recalculates the Lead Score for a prospect on the server.
 * No-op (returns `{ ok:true, skipped:"feature_disabled" }`) when the tenant has
 * not enabled the feature in `orbit_lead_score_config`.
 */
export async function recalculateLeadScore(
  empresaId: string,
  prospectId: string,
): Promise<LeadScoreResult> {
  const { data, error } = await (supabase.rpc as any)("recalculate_lead_score", {
    p_empresa_id: empresaId,
    p_prospect_id: prospectId,
  });
  if (error) throw error;
  return (data ?? { ok: false }) as LeadScoreResult;
}

export const LEAD_SCORE_LABEL_STYLES: Record<string, { label: string; className: string }> = {
  cold: { label: "Frio", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  warm: { label: "Morno", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  hot: { label: "Quente", className: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  priority: { label: "Prioridade", className: "bg-brand/15 text-brand border-brand/30" },
};
