// Elegibilidade específica de recipient de campanha WhatsApp.
// Aplica flags configuráveis em orbit_campaigns.filtros_json.campaign_safety
// além das regras universais (tenant, prospect deleted/missing, optout,
// terminal deal, meeting futura, handoff, sintético).
//
// NÃO chama Z-API. NÃO altera nada. Retorna eligible + motivo.

export interface CampaignSafetyFlags {
  skip_if_contacted: boolean;
  skip_if_replied: boolean;
  skip_if_handoff: boolean;
  skip_if_future_meeting: boolean;
  skip_if_terminal: boolean;
  skip_if_deleted: boolean;
  skip_if_optout: boolean;
  skip_if_synthetic: boolean;
}

export const DEFAULT_CAMPAIGN_SAFETY: CampaignSafetyFlags = {
  skip_if_contacted: false,
  skip_if_replied: false,
  skip_if_handoff: false,
  skip_if_future_meeting: false,
  skip_if_terminal: false,
  skip_if_deleted: false,
  skip_if_optout: false,
  skip_if_synthetic: false,
};

export function resolveCampaignSafety(campaign: any): CampaignSafetyFlags {
  const raw = campaign?.filtros_json?.campaign_safety ?? {};
  return {
    skip_if_contacted: raw.skip_if_contacted === true,
    skip_if_replied: raw.skip_if_replied === true,
    skip_if_handoff: raw.skip_if_handoff === true,
    skip_if_future_meeting: raw.skip_if_future_meeting === true,
    skip_if_terminal: raw.skip_if_terminal === true,
    skip_if_deleted: raw.skip_if_deleted === true,
    skip_if_optout: raw.skip_if_optout === true,
    skip_if_synthetic: raw.skip_if_synthetic === true,
  };
}

const SYNTHETIC_EMAIL_RE = /^fbcfarias\+fabrica-|@example\.(com|org|net)$/i;

export function isSyntheticProspect(p: any): boolean {
  const nome = String(p?.nome_razao ?? p?.nome_contato ?? p?.nome_fantasia ?? "").toLowerCase();
  const email = String(p?.email_principal ?? p?.email ?? "").toLowerCase();
  if (nome.includes("smoke")) return true;
  if (email && SYNTHETIC_EMAIL_RE.test(email)) return true;
  const tags: string[] = Array.isArray(p?.tags) ? p.tags.map((t: any) => String(t).toLowerCase()) : [];
  if (tags.some((t) => t.includes("smoke") || t.includes("teste") || t.includes("synthetic"))) return true;
  return false;
}

export interface CampaignRecipientEligibility {
  eligible: boolean;
  motivo: string | null;
}

// Regras universais (fail-closed) sempre aplicadas, independente das flags.
const UNIVERSAL_MOTIVOS = {
  prospect_missing: "prospect_missing",
  prospect_deleted: "prospect_deleted",
  cross_tenant: "cross_tenant",
  opt_out: "opt_out",
  terminal_deal: "terminal_deal",
  meeting_scheduled: "meeting_scheduled",
} as const;

export async function checkCampaignRecipientEligibility(
  supabase: any,
  params: {
    campaign: any;
    empresa_id: string;
    prospect: any | null;
  },
): Promise<CampaignRecipientEligibility> {
  const { campaign, empresa_id, prospect } = params;
  const flags = resolveCampaignSafety(campaign);

  // Prospect universal checks (fail-closed)
  if (!prospect) return { eligible: false, motivo: UNIVERSAL_MOTIVOS.prospect_missing };
  if (prospect.deleted_at) return { eligible: false, motivo: UNIVERSAL_MOTIVOS.prospect_deleted };
  if (prospect.empresa_id && prospect.empresa_id !== empresa_id)
    return { eligible: false, motivo: UNIVERSAL_MOTIVOS.cross_tenant };
  if (prospect.optout_whatsapp === true)
    return { eligible: false, motivo: UNIVERSAL_MOTIVOS.opt_out };

  // Sintético — configurável (mas Fábrica ativa)
  if (flags.skip_if_synthetic && isSyntheticProspect(prospect)) {
    return { eligible: false, motivo: "synthetic" };
  }

  // Terminal deal (universal semanticamente, mas gated por flag pra reengajamento)
  if (flags.skip_if_terminal) {
    const { data: deals } = await supabase
      .from("orbit_deals")
      .select("id, status, deleted_at, etapa_id")
      .eq("empresa_id", empresa_id)
      .eq("prospect_id", prospect.id);
    const list = (deals ?? []) as any[];
    let terminal = false;
    const stageIds: string[] = [];
    for (const d of list) {
      if (d.deleted_at) { terminal = true; break; }
      const s = String(d.status ?? "").toLowerCase();
      if (["won", "lost", "ganho", "perdido", "deleted"].includes(s)) { terminal = true; break; }
      if (d.etapa_id) stageIds.push(d.etapa_id);
    }
    if (!terminal && stageIds.length > 0) {
      const { data: stages } = await supabase
        .from("orbit_pipeline_stages")
        .select("id, is_won, is_lost")
        .in("id", stageIds);
      if ((stages ?? []).some((s: any) => s.is_won === true || s.is_lost === true)) terminal = true;
    }
    if (terminal) return { eligible: false, motivo: UNIVERSAL_MOTIVOS.terminal_deal };
  }

  // Meeting futura
  if (flags.skip_if_future_meeting) {
    const { data: mtg } = await supabase
      .from("orbit_meetings")
      .select("id, status, scheduled_at")
      .eq("prospect_id", prospect.id)
      .in("status", ["scheduled", "rescheduled"])
      .gte("scheduled_at", new Date().toISOString())
      .limit(1);
    if (mtg && mtg.length > 0) return { eligible: false, motivo: UNIVERSAL_MOTIVOS.meeting_scheduled };
  }

  // Conversa: handoff, contacted, replied — resolvem por prospect_id+empresa_id
  if (flags.skip_if_contacted || flags.skip_if_replied || flags.skip_if_handoff) {
    const { data: convs } = await supabase
      .from("orbit_conversas")
      .select("id, human_talk, human_user_id, handoff_sent_at")
      .eq("prospect_id", prospect.id)
      .eq("empresa_id", empresa_id);
    const list = (convs ?? []) as any[];
    if (list.length > 0) {
      if (flags.skip_if_handoff && list.some((c) => c.human_talk === true || c.human_user_id)) {
        return { eligible: false, motivo: "human_handoff" };
      }
      const convIds = list.map((c) => c.id);
      if (flags.skip_if_contacted) {
        const { data: outMsgs } = await supabase
          .from("orbit_mensagens")
          .select("id")
          .in("conversa_id", convIds)
          .eq("direcao", "OUT")
          .in("status", ["enviada", "sent", "entregue", "delivered"])
          .limit(1);
        if (outMsgs && outMsgs.length > 0) return { eligible: false, motivo: "already_contacted" };
      }
      if (flags.skip_if_replied) {
        const { data: inMsgs } = await supabase
          .from("orbit_mensagens")
          .select("id")
          .in("conversa_id", convIds)
          .eq("direcao", "IN")
          .limit(1);
        if (inMsgs && inMsgs.length > 0) return { eligible: false, motivo: "lead_replied" };
      }
    }
  }

  return { eligible: true, motivo: null };
}

/** Marca um recipient como ignorado (terminal). Idempotente por status. */
export async function markRecipientIgnorado(
  supabase: any,
  recipient_id: string,
  motivo: string,
): Promise<void> {
  await supabase
    .from("orbit_campaign_recipients")
    .update({
      status: "ignorado",
      ignorado_em: new Date().toISOString(),
      ignorado_motivo: motivo,
      erro: null,
    })
    .eq("id", recipient_id)
    .eq("status", "pendente");
}
