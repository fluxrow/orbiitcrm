// Política tenant-scoped de cota diária de PRIMEIROS CONTATOS da lista antiga.
//
// Contexto (aprovado explicitamente pelo cliente Viver Semijoias):
//   • 20 primeiros contatos diários da lista antiga, bem espaçados.
//   • Follow-ups, respostas de IA e lembretes ficam FORA dessas 20 vagas.
//   • Novos leads de formulário (typebot / flow_initial) NÃO são lista antiga.
//
// Decisão de contagem: os primeiros contatos da lista antiga chegam ao outbox
// exclusivamente como `source_type='campaign'` (campanhas controladas de
// reengajamento). Logo, para Viver, SOMENTE `campaign` consome a cota diária de
// 20. Nada é relabelado e nenhum contador é zerado.
//
// Outros tenants continuam com a política existente (campaign + flow_initial +
// flow_followup agregados na rampa de warm-up).
//
// Fora da cota diária, TODOS os envios proativos continuam sujeitos a:
// ritmo por minuto, janela comercial, consentimento/elegibilidade, opt-out,
// handoff humano, reunião agendada, idempotência e demais gates existentes.

import {
  type EffectiveLimit,
  effectiveDailyLimit,
  PROSPECTING_QUOTA_SOURCES,
  saoPauloDate,
  type WarmupConfigInput,
} from "./outbox-quota.ts";

export const VIVER_SEMIJOIAS_EMPRESA_ID =
  "36f26579-66ad-4ef1-9788-141e4c727232";

/** Vagas diárias de primeiro contato da lista antiga aprovadas para Viver. */
export const VIVER_DAILY_FIRST_CONTACT_LIMIT = 20;

/** Teto máximo aceito em `controlled_reengagement.daily_cap` (somente Viver). */
export const VIVER_CONTROLLED_DAILY_CAP_MAX = VIVER_DAILY_FIRST_CONTACT_LIMIT;

/** Espaçamento mínimo entre envios reais de campanha da lista (30 min). */
export const VIVER_CAMPAIGN_MIN_GAP_MS = 30 * 60_000;

/** Fontes que consomem a cota diária de 20 vagas da Viver. */
export const VIVER_DAILY_QUOTA_SOURCES = ["campaign"] as const;

export const RETAIN_REASON_VIVER_CAMPAIGN_SPACING =
  "VIVER_CAMPAIGN_MIN_GAP";

/** Leitura do último envio real falhou: fail-closed (adia, nunca libera). */
export const RETAIN_REASON_VIVER_SPACING_UNKNOWN =
  "VIVER_CAMPAIGN_GAP_UNKNOWN";

/** Outro tick já detém a vaga de primeiro contato do tenant. */
export const RETAIN_REASON_VIVER_SLOT_LOCK =
  "VIVER_CAMPAIGN_SLOT_LOCKED";


export function isViverTenant(empresaId: unknown): boolean {
  return String(empresaId ?? "") === VIVER_SEMIJOIAS_EMPRESA_ID;
}

/** Lista de `source_type` que entra na contagem diária do tenant. */
export function dailyQuotaSourcesFor(empresaId: unknown): string[] {
  return isViverTenant(empresaId)
    ? [...VIVER_DAILY_QUOTA_SOURCES]
    : [...PROSPECTING_QUOTA_SOURCES];
}

/** Um item consome a cota diária deste tenant? */
export function consumesDailyQuotaFor(
  empresaId: unknown,
  sourceType: string | null | undefined,
): boolean {
  return dailyQuotaSourcesFor(empresaId).includes(String(sourceType ?? ""));
}

/**
 * Limite diário efetivo do tenant.
 * Viver: teto duro de 20, independente da rampa de warm-up (que poderia
 * ultrapassar 20). Outros tenants: comportamento existente inalterado.
 */
export function effectiveDailyLimitFor(
  empresaId: unknown,
  cfg: WarmupConfigInput,
  now: Date = new Date(),
): EffectiveLimit {
  const base = effectiveDailyLimit(cfg, now);
  if (!isViverTenant(empresaId)) return base;
  const limit = base.limit == null
    ? VIVER_DAILY_FIRST_CONTACT_LIMIT
    : Math.min(base.limit, VIVER_DAILY_FIRST_CONTACT_LIMIT);
  return {
    limit,
    warmup_day: base.warmup_day,
    ramp_value: base.ramp_value,
    source: limit === base.limit && base.source !== "unlimited"
      ? base.source
      : "daily_limit",
  };
}

/** Data de referência do contador diário — sempre America/Sao_Paulo. */
export function dailyUsageDate(now: Date = new Date()): string {
  return saoPauloDate(now);
}

/** Data legada (UTC) usada historicamente pelos demais tenants. */
export function legacyDailyUsageDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Data do contador diário por tenant: Viver usa America/Sao_Paulo (política
 * aprovada das 20 vagas); os demais tenants preservam a data legada em UTC.
 */
export function dailyUsageDateFor(
  empresaId: unknown,
  now: Date = new Date(),
): string {
  return isViverTenant(empresaId)
    ? dailyUsageDate(now)
    : legacyDailyUsageDate(now);
}


/** Teto aceito para o piloto controlado (20 apenas Viver, 10 nos demais). */
export function maxControlledDailyCap(empresaId: unknown): number {
  return isViverTenant(empresaId) ? VIVER_CONTROLLED_DAILY_CAP_MAX : 10;
}

export function isControlledDailyCapAccepted(
  empresaId: unknown,
  cap: unknown,
): boolean {
  const n = Number(cap);
  return Number.isInteger(n) && n >= 1 && n <= maxControlledDailyCap(empresaId);
}

/**
 * Espera restante para respeitar o espaçamento de 30 min entre campanhas da
 * lista, medido pelo ÚLTIMO ENVIO REAL. Hold legítimo: a espera é sempre
 * relativa ao último envio, então backlog vencido não dispara em rajada e não
 * existe acúmulo compensatório de vagas perdidas.
 */
export function viverCampaignSpacingWaitMs(params: {
  empresaId: unknown;
  sourceType: string | null | undefined;
  lastCampaignSentAtMs: number | null;
  nowMs?: number;
}): number {
  if (!isViverTenant(params.empresaId)) return 0;
  if (String(params.sourceType ?? "") !== "campaign") return 0;
  if (params.lastCampaignSentAtMs == null) return 0;
  if (!Number.isFinite(params.lastCampaignSentAtMs)) return 0;
  const nowMs = params.nowMs ?? Date.now();
  const elapsed = nowMs - params.lastCampaignSentAtMs;
  if (elapsed >= VIVER_CAMPAIGN_MIN_GAP_MS) return 0;
  return VIVER_CAMPAIGN_MIN_GAP_MS - elapsed;
}

/**
 * A leitura do último envio real só é necessária para primeiro contato da lista
 * antiga da Viver. Nenhum outro tenant e nenhuma outra origem (`ai_reply`,
 * `flow_initial`, `flow_followup`, lembretes…) consulta esse dado.
 */
export function needsViverCampaignSpacingCheck(
  empresaId: unknown,
  sourceType: string | null | undefined,
): boolean {
  return isViverTenant(empresaId) &&
    String(sourceType ?? "") === "campaign";
}

export interface ViverInflightClaim {
  id: string;
  locked_by?: string | null;
}

/**
 * @deprecated NÃO é exclusão mútua e não é mais usada no caminho de envio.
 * O worker A (id maior) podia consultar quando só A estava `processing`, iniciar
 * o HTTP, e o worker B (id menor), reivindicado depois, também prosseguia.
 * A enforcement passou para a trava atômica no banco
 * (`viver_campaign_slot_try_acquire` + `outbox_claim_batch`), exposta em
 * `viver-campaign-slot-lock.ts`. Mantida apenas como referência histórica.
 */

export function viverCampaignSlotDecision(params: {
  empresaId: unknown;
  sourceType: string | null | undefined;
  itemId: string;
  inflight: ViverInflightClaim[];
}): { proceed: boolean; reason?: string; blocked_by?: string } {
  if (!needsViverCampaignSpacingCheck(params.empresaId, params.sourceType)) {
    return { proceed: true };
  }
  const others = (params.inflight ?? [])
    .map((r) => String(r?.id ?? ""))
    .filter((id) => id && id !== params.itemId)
    .sort();
  const winner = others.find((id) => id < params.itemId);
  if (winner) {
    return {
      proceed: false,
      reason: RETAIN_REASON_VIVER_SLOT_LOCK,
      blocked_by: winner,
    };
  }
  return { proceed: true };
}
