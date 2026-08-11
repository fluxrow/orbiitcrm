// _shared/warmup-schedule.ts
// Fonte única do WARM-UP determinístico da fila global de WhatsApp (outbox).
//
// SEMÂNTICA DO daily_limit (leia antes de mexer):
//   • warmup_enabled = false  -> o limite diário é exatamente `daily_limit`.
//   • warmup_enabled = true   -> o limite diário é a RAMPA determinística abaixo,
//     calculada por dias corridos desde `warmup_start_date`:
//         D1 = 10, D2 = 15, D3 = 25, D4 = 40, D5+ = 60
//     Nesse modo, `daily_limit` NÃO congela o crescimento: ele é apenas o
//     "baseline de partida" configurado na UI (tipicamente 10). Só é aplicado como
//     teto quando for MAIOR OU IGUAL ao topo da rampa (WARMUP_RAMP_CEILING = 60),
//     ou seja, quando o tenant realmente quer um teto pós-warmup mais baixo que a
//     rampa final. Um daily_limit=10 com warmup ligado significa "comece em 10",
//     nunca "fique preso em 10".
//   • Quando o warm-up termina (D5+) o teto efetivo passa a ser
//     min(60, daily_limit) se daily_limit >= 60, senão 60.
//
// A cota vale para TODAS as origens da fila (ai_reply, manual,
// meeting_confirmation, flow_initial, flow_followup, flow_stage, campaign) e para
// todos os payload_type. Não existe bypass por origem no warm-up.

export const WARMUP_RAMP = [10, 15, 25, 40, 60] as const;
export const WARMUP_RAMP_CEILING = WARMUP_RAMP[WARMUP_RAMP.length - 1];

export const RETAIN_REASON_DAILY = "WARMUP_DAILY_LIMIT";
export const RETAIN_REASON_RATE = "WARMUP_RATE_LIMIT";

export interface WarmupConfigInput {
  warmup_enabled?: boolean | null;
  warmup_start_date?: string | null;
  daily_limit?: number | null;
}

export interface EffectiveLimit {
  limit: number | null;
  /** Dia da rampa em base 1 (D1, D2, ...). null quando warm-up desligado. */
  warmup_day: number | null;
  ramp_value: number | null;
  source: "warmup_ramp" | "warmup_ramp_capped_by_daily_limit" | "daily_limit" | "unlimited";
}

/** Dias corridos (America/Sao_Paulo) desde warmup_start_date. D1 = dia do início. */
export function warmupDay(startDate: string, now: Date = new Date()): number {
  const start = Date.parse(`${String(startDate).slice(0, 10)}T00:00:00-03:00`);
  const today = Date.parse(`${saoPauloDate(now)}T00:00:00-03:00`);
  const diff = Math.floor((today - start) / 86400000);
  return Math.max(0, diff) + 1;
}

export function saoPauloDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Limite diário efetivo do tenant, respeitando a rampa de warm-up. */
export function effectiveDailyLimit(cfg: WarmupConfigInput, now: Date = new Date()): EffectiveLimit {
  const dailyLimit = cfg.daily_limit == null ? null : Number(cfg.daily_limit);
  if (cfg.warmup_enabled !== true || !cfg.warmup_start_date) {
    return {
      limit: dailyLimit,
      warmup_day: null,
      ramp_value: null,
      source: dailyLimit == null ? "unlimited" : "daily_limit",
    };
  }
  const day = warmupDay(cfg.warmup_start_date, now);
  const ramp = WARMUP_RAMP[Math.min(day - 1, WARMUP_RAMP.length - 1)];
  // daily_limit só age como teto quando é um teto de verdade (>= topo da rampa).
  const capped = dailyLimit != null && dailyLimit >= WARMUP_RAMP_CEILING && dailyLimit < ramp;
  return {
    limit: capped ? dailyLimit! : ramp,
    warmup_day: day,
    ramp_value: ramp,
    source: capped ? "warmup_ramp_capped_by_daily_limit" : "warmup_ramp",
  };
}

// ── Simulação pura (usada em testes; espelha a decisão do worker) ──

export interface SimItem {
  id: string;
  source_type: string;
  payload_type?: string;
}

export interface SimDecision {
  id: string;
  source_type: string;
  decision: "send" | "retain";
  reason?: string;
}

export interface SimInput {
  items: SimItem[];
  config: WarmupConfigInput;
  sent_today?: number;
  /** Envios já contabilizados na janela corrente de 60s. */
  sent_last_minute?: number;
  max_per_minute?: number | null;
  now?: Date;
}

/**
 * Decide item a item, na ordem recebida, o que sai e o que fica retido.
 * Sem bypass por source_type/payload_type: a cota vale para todas as origens.
 */
export function simulateWarmupBatch(input: SimInput): {
  decisions: SimDecision[];
  sent: SimDecision[];
  retained: SimDecision[];
  effective: EffectiveLimit;
} {
  const effective = effectiveDailyLimit(input.config, input.now ?? new Date());
  let used = input.sent_today ?? 0;
  let minute = input.sent_last_minute ?? 0;
  const perMinute = input.max_per_minute ?? null;
  const decisions: SimDecision[] = [];

  for (const item of input.items) {
    if (effective.limit != null && used >= effective.limit) {
      decisions.push({ id: item.id, source_type: item.source_type, decision: "retain", reason: RETAIN_REASON_DAILY });
      continue;
    }
    if (perMinute != null && perMinute > 0 && minute >= perMinute) {
      decisions.push({ id: item.id, source_type: item.source_type, decision: "retain", reason: RETAIN_REASON_RATE });
      continue;
    }
    used++;
    minute++;
    decisions.push({ id: item.id, source_type: item.source_type, decision: "send" });
  }

  return {
    decisions,
    sent: decisions.filter((d) => d.decision === "send"),
    retained: decisions.filter((d) => d.decision === "retain"),
    effective,
  };
}

/** Próxima janela para reprocessar um item retido. */
export function nextAttemptForRetain(reason: string, now: Date = new Date()): string {
  if (reason === RETAIN_REASON_RATE) return new Date(now.getTime() + 60_000).toISOString();
  // Cota diária: reabre no início do próximo dia São Paulo (00:00 -03:00).
  const today = saoPauloDate(now);
  const nextDay = new Date(Date.parse(`${today}T00:00:00-03:00`) + 86400000);
  return nextDay.toISOString();
}
