// Regra de corte de automação por tenant (orbit_ai_config.auto_reply_new_leads_from).
//
// Objetivo: quando um tenant é migrado para operação automática, apenas leads criados
// A PARTIR do instante de corte podem receber IA automática e novas cadências.
// Prospects anteriores continuam existindo, recebem inbound (histórico/UI) e ficam
// permanentemente em atendimento humano (human_talk=true) — nunca agente, nunca D+1/D+3.
//
// Regras (ordenadas):
//   1. cutoff NULL  → comportamento inalterado (demais tenants não são afetados).
//   2. prospect inexistente / de outro tenant / deleted_at → bloqueia automação.
//   3. prospect.created_at < cutoff → bloqueia automação (automation_cutoff).
//      Exatamente igual ao cutoff (>=) é permitido.
//   4. conversa arquivada / em quarentena / human_talk=true → bloqueia automação.
//
// Este helper NUNCA envia nada e NUNCA reprocessa histórico: é somente um gate de leitura.

export const AUTOMATION_CUTOFF_REASON = "automation_cutoff";

export interface AutomationCutoffDecision {
  allowed: boolean;
  reason: string | null;
  cutoff: string | null;
}

const ALLOWED: AutomationCutoffDecision = { allowed: true, reason: null, cutoff: null };

/** Lê o corte do tenant. Retorna null quando não configurado (ou tenant ausente). */
export async function loadAutomationCutoff(
  supabase: any,
  empresaId: string | null | undefined,
): Promise<string | null> {
  if (!empresaId) return null;
  const { data } = await supabase
    .from("orbit_ai_config")
    .select("auto_reply_new_leads_from")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const raw = data?.auto_reply_new_leads_from ?? null;
  return raw ? String(raw) : null;
}

/** Comparação pura de instantes. `>= cutoff` passa; 1ms antes não passa. */
export function isCreatedAfterCutoff(
  cutoff: string | null | undefined,
  createdAt: string | null | undefined,
): boolean {
  if (!cutoff) return true; // sem corte: nada muda
  if (!createdAt) return false; // sem created_at conhecido: trata como legado
  const c = Date.parse(cutoff);
  const p = Date.parse(createdAt);
  if (Number.isNaN(c)) return true;
  if (Number.isNaN(p)) return false;
  return p >= c;
}

export interface AutomationCutoffInput {
  empresa_id: string | null | undefined;
  prospect_id?: string | null;
  conversa_id?: string | null;
  /** Linhas já carregadas pelo chamador (evita re-fetch). */
  prospect?: { id?: string; empresa_id?: string | null; created_at?: string | null; deleted_at?: string | null } | null;
  conversa?: { id?: string; empresa_id?: string | null; human_talk?: boolean | null; archived_at?: string | null; quarantine_reason?: string | null } | null;
  /** Cutoff já lido (evita re-fetch). Passe `undefined` para o helper carregar. */
  cutoff?: string | null;
}

/**
 * Decide se automação (IA/cadência/campanha) pode agir sobre este prospect/conversa.
 * Sempre resolve para `allowed:true` quando o tenant não tem cutoff configurado.
 */
export async function evaluateAutomationCutoff(
  supabase: any,
  input: AutomationCutoffInput,
): Promise<AutomationCutoffDecision> {
  const empresaId = input.empresa_id ?? null;
  const cutoff = input.cutoff !== undefined
    ? input.cutoff
    : await loadAutomationCutoff(supabase, empresaId);

  if (!cutoff) return ALLOWED;

  // ── Prospect ──
  let prospect = input.prospect ?? null;
  if (!prospect && input.prospect_id) {
    const { data } = await supabase
      .from("orbit_prospects")
      .select("id, empresa_id, created_at, deleted_at")
      .eq("id", input.prospect_id)
      .maybeSingle();
    prospect = data ?? null;
  }
  if (input.prospect_id || prospect) {
    if (!prospect) return { allowed: false, reason: "prospect_missing", cutoff };
    if (prospect.empresa_id && empresaId && prospect.empresa_id !== empresaId) {
      return { allowed: false, reason: "cross_tenant", cutoff };
    }
    if (prospect.deleted_at) return { allowed: false, reason: "prospect_deleted", cutoff };
    if (!isCreatedAfterCutoff(cutoff, prospect.created_at)) {
      return { allowed: false, reason: AUTOMATION_CUTOFF_REASON, cutoff };
    }
  }

  // ── Conversa ──
  let conversa = input.conversa ?? null;
  if (!conversa && input.conversa_id) {
    const { data } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, human_talk, archived_at, quarantine_reason")
      .eq("id", input.conversa_id)
      .maybeSingle();
    conversa = data ?? null;
  }
  if (conversa) {
    if (conversa.empresa_id && empresaId && conversa.empresa_id !== empresaId) {
      return { allowed: false, reason: "cross_tenant", cutoff };
    }
    if (conversa.archived_at || conversa.quarantine_reason) {
      return { allowed: false, reason: "conversa_archived", cutoff };
    }
    if (conversa.human_talk === true) {
      return { allowed: false, reason: "human_talk", cutoff };
    }
  }

  return { allowed: true, reason: null, cutoff };
}
