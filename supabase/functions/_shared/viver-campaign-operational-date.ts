// ─────────────────────────────────────────────────────────────────────────────
// Viver Semijoias — contrato de DIA OPERACIONAL das campanhas controladas.
//
// Problema: espaçar 10 min não impede que um item vencido atravesse a virada do
// dia (America/Sao_Paulo) e ocupe vagas do dia seguinte como compensação.
//
// Contrato: só vale para o tenant Viver, source_type=campaign, campanha de um
// dos batches JÁ autorizados e que tenha `filtros_json.operational_date`.
//   • dia SP atual  >  operational_date  →  EXPIRA (cancela/ignora, sem excluir,
//     sem reenviar e sem repor vaga).
//   • dia SP atual  <  operational_date  →  ESPERA (adia até 00:00 SP do dia).
//   • dia SP atual  == operational_date  →  segue os gates normais (10 min, 50/dia).
//   • operational_date inválida          →  FAIL-CLOSED (adia e audita).
//   • item já aceito pelo provedor       →  nunca cancela nem reenvia.
// Campanhas/tenants sem esse contrato ficam exatamente como hoje.
// ─────────────────────────────────────────────────────────────────────────────

import { dailyUsageDate } from "./viver-daily-quota-policy.ts";

export const VIVER_OPERATIONAL_DATE_EMPRESA_ID =
  "36f26579-66ad-4ef1-9788-141e4c727232";

/** Batches já autorizados (rampa 5/8/10 e recuperação pontual D0). */
export const VIVER_OPERATIONAL_DATE_BATCH_LABELS: readonly string[] = [
  "viver_fernanda_audio_ramp_5_8_10_2026-09-09",
  "viver_d0_recovery_2026-09-09_1827_sp",
];

/** Motivos sanitizados e auditáveis (sem PII, sem token). */
export const VIVER_OPERATIONAL_DATE_EXPIRED_REASON =
  "viver_operational_date_expired";
export const VIVER_OPERATIONAL_DATE_FUTURE_REASON =
  "viver_operational_date_future";
export const VIVER_OPERATIONAL_DATE_INVALID_REASON =
  "viver_operational_date_invalid";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Status de outbox que já representam entrega aceita/encerrada. */
const ACCEPTED_OUTBOX_STATUS = new Set(["sent", "delivered", "read"]);

export interface ViverOperationalDateCampaign {
  id?: string | null;
  empresa_id?: string | null;
  filtros_json?: Record<string, any> | null;
}

export interface ViverOperationalDateDecision {
  verdict: "not_applicable" | "proceed" | "wait" | "expire" | "fail_closed";
  reason: string;
  operational_date?: string | null;
  today_sp?: string | null;
  /** Para `wait`/`fail_closed`: quando reavaliar. */
  retry_at?: string | null;
}

function isViver(empresaId: unknown): boolean {
  return String(empresaId ?? "") === VIVER_OPERATIONAL_DATE_EMPRESA_ID;
}

function batchLabelOf(campaign: ViverOperationalDateCampaign | null): string {
  return String(campaign?.filtros_json?.batch_label ?? "");
}

/** Contrato presente? tenant + campaign + batch autorizado + campo existente. */
export function hasViverOperationalDateContract(params: {
  empresa_id?: unknown;
  source_type?: string | null;
  campaign?: ViverOperationalDateCampaign | null;
}): boolean {
  if (!isViver(params.empresa_id)) return false;
  if (String(params.source_type ?? "") !== "campaign") return false;
  const campaign = params.campaign ?? null;
  if (!campaign) return false;
  if (!VIVER_OPERATIONAL_DATE_BATCH_LABELS.includes(batchLabelOf(campaign))) {
    return false;
  }
  return campaign.filtros_json?.operational_date !== undefined &&
    campaign.filtros_json?.operational_date !== null;
}

/** 00:00 do dia operacional em America/Sao_Paulo (UTC-3, sem horário de verão). */
export function viverOperationalDayStartIso(operationalDate: string): string {
  return new Date(`${operationalDate}T00:00:00-03:00`).toISOString();
}

export function viverOperationalDateDecision(params: {
  empresa_id?: unknown;
  source_type?: string | null;
  campaign?: ViverOperationalDateCampaign | null;
  /** Estado atual do item: provider aceito nunca é cancelado. */
  provider_message_id?: string | null;
  status?: string | null;
  now?: Date;
}): ViverOperationalDateDecision {
  if (!hasViverOperationalDateContract(params)) {
    return { verdict: "not_applicable", reason: "no_operational_date_contract" };
  }
  const now = params.now ?? new Date();
  const today = dailyUsageDate(now);

  const status = String(params.status ?? "").toLowerCase();
  if (params.provider_message_id || ACCEPTED_OUTBOX_STATUS.has(status)) {
    return {
      verdict: "proceed",
      reason: "provider_already_accepted",
      today_sp: today,
    };
  }

  const raw = params.campaign?.filtros_json?.operational_date;
  const operationalDate = typeof raw === "string" ? raw.trim() : "";
  if (
    !DATE_RE.test(operationalDate) ||
    Number.isNaN(Date.parse(`${operationalDate}T00:00:00-03:00`))
  ) {
    return {
      verdict: "fail_closed",
      reason: VIVER_OPERATIONAL_DATE_INVALID_REASON,
      operational_date: operationalDate || null,
      today_sp: today,
      retry_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
    };
  }

  if (today > operationalDate) {
    return {
      verdict: "expire",
      reason: VIVER_OPERATIONAL_DATE_EXPIRED_REASON,
      operational_date: operationalDate,
      today_sp: today,
    };
  }
  if (today < operationalDate) {
    return {
      verdict: "wait",
      reason: VIVER_OPERATIONAL_DATE_FUTURE_REASON,
      operational_date: operationalDate,
      today_sp: today,
      retry_at: viverOperationalDayStartIso(operationalDate),
    };
  }
  return {
    verdict: "proceed",
    reason: "operational_date_today",
    operational_date: operationalDate,
    today_sp: today,
  };
}
