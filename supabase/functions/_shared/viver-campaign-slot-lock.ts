// Trava ATÔMICA da vaga de primeiro contato da lista antiga (somente Viver).
//
// Por que a eleição pelo menor id NÃO servia:
//   • worker A reivindica o item X (id maior) e consulta os claims em voo: só X
//     está `processing`, então A começa o HTTP de envio;
//   • worker B reivindica DEPOIS o item Y (id menor), vê X e Y, elege Y (menor)
//     e também envia — antes de A registrar `sent`.
// Duas campanhas saem dentro dos 30 min. O interleaving não depende de execução
// "simultânea": basta a consulta de A acontecer antes do claim de B.
//
// Correção: a exclusão passa a ser decidida pelo banco, na MESMA transação do
// claim, sob `pg_try_advisory_xact_lock` por tenant (função SQL
// `viver_campaign_slot_try_acquire` + `outbox_claim_batch`). Este módulo
// concentra a semântica (para testes determinísticos) e a chamada fail-closed.
//
// Nada aqui se aplica a outros tenants nem a outras origens (`ai_reply`,
// `flow_initial`, `flow_followup`, lembretes…): elas retornam sempre liberadas.

import {
  isViverTenant,
  needsViverCampaignSpacingCheck,
  RETAIN_REASON_VIVER_CAMPAIGN_SPACING,
  RETAIN_REASON_VIVER_SLOT_LOCK,
  RETAIN_REASON_VIVER_SPACING_UNKNOWN,
  VIVER_CAMPAIGN_MIN_GAP_MS,
} from "./viver-daily-quota-policy.ts";

export const VIVER_SLOT_LOCK_VERSION = "2026-09-11-atomic-slot-v1";

/** Lease padrão do claim (igual ao usado em `outbox_claim_batch`). */
export const VIVER_SLOT_LEASE_MS = 120_000;

/** Execução dirigida (`{ outbox_id }`) de campanha Viver é recusada. */
export const RETAIN_REASON_VIVER_TARGETED_CAMPAIGN =
  "VIVER_CAMPAIGN_TARGETED_REFUSED";

export interface ViverSlotClaimRow {
  id: string;
  status?: string | null;
  source_type?: string | null;
  /** ISO ou epoch ms do lease. */
  locked_at?: string | number | null;
}

export interface ViverSlotOutcome {
  acquired: boolean;
  reason: string;
  /** Espera sugerida (ms) quando o bloqueio é o espaçamento de 30 min. */
  wait_ms?: number;
  /** Motivo de retenção correspondente, quando negado. */
  retain_reason?: string;
}

function leaseMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Semântica EXATA da função SQL, isolada para teste determinístico.
 * Não existe comparação de ids: qualquer OUTRA campanha com lease válida
 * bloqueia, independentemente de qual chegou primeiro.
 */
export function evaluateViverCampaignSlot(params: {
  empresaId: unknown;
  sourceType: string | null | undefined;
  itemId: string;
  itemStatus?: string | null;
  inflight: ViverSlotClaimRow[];
  lastCampaignSentAtMs?: number | null;
  nowMs?: number;
  leaseWindowMs?: number;
  minGapMs?: number;
}): ViverSlotOutcome {
  if (!needsViverCampaignSpacingCheck(params.empresaId, params.sourceType)) {
    return { acquired: true, reason: "not_applicable" };
  }
  if (
    params.itemStatus != null &&
    String(params.itemStatus) !== "processing"
  ) {
    return {
      acquired: false,
      reason: "item_not_processing",
      retain_reason: RETAIN_REASON_VIVER_SLOT_LOCK,
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const lease = params.leaseWindowMs ?? VIVER_SLOT_LEASE_MS;
  const cutoff = nowMs - lease;

  const blocking = (params.inflight ?? []).some((row) => {
    if (!row) return false;
    if (String(row.id ?? "") === String(params.itemId)) return false;
    if (String(row.source_type ?? "campaign") !== "campaign") return false;
    if (String(row.status ?? "processing") !== "processing") return false;
    const at = leaseMs(row.locked_at);
    if (at == null) return false; // lease sem marca não reserva vaga
    return at >= cutoff; // lease expirada não reserva vaga
  });
  if (blocking) {
    return {
      acquired: false,
      reason: "slot_locked",
      retain_reason: RETAIN_REASON_VIVER_SLOT_LOCK,
    };
  }

  const last = params.lastCampaignSentAtMs ?? null;
  const gap = params.minGapMs ?? VIVER_CAMPAIGN_MIN_GAP_MS;
  if (last != null && Number.isFinite(last)) {
    const elapsed = nowMs - last;
    if (elapsed < gap) {
      return {
        acquired: false,
        reason: "min_gap",
        wait_ms: gap - elapsed,
        retain_reason: RETAIN_REASON_VIVER_CAMPAIGN_SPACING,
      };
    }
  }

  return { acquired: true, reason: "acquired" };
}

/**
 * Árbitro serializado que reproduz o lock transacional do Postgres. Usado nos
 * testes de interleaving (A começa antes de B, ids invertidos, dois workers,
 * lease ativa/expirada): a seção crítica é indivisível, então o segundo worker
 * SEMPRE encontra a reserva do primeiro, mesmo consultando antes do `sent`.
 */
export class ViverCampaignSlotArbiter {
  private locked = false;
  constructor(
    private readonly state: {
      rows: Map<string, ViverSlotClaimRow>;
      lastCampaignSentAtMs: number | null;
    },
  ) {}

  tryAcquire(params: {
    empresaId: unknown;
    sourceType: string | null | undefined;
    itemId: string;
    nowMs: number;
    leaseWindowMs?: number;
    minGapMs?: number;
  }): ViverSlotOutcome {
    if (!needsViverCampaignSpacingCheck(params.empresaId, params.sourceType)) {
      return { acquired: true, reason: "not_applicable" };
    }
    if (this.locked) {
      return {
        acquired: false,
        reason: "slot_lock_contended",
        retain_reason: RETAIN_REASON_VIVER_SLOT_LOCK,
      };
    }
    this.locked = true;
    try {
      const row = this.state.rows.get(params.itemId);
      return evaluateViverCampaignSlot({
        empresaId: params.empresaId,
        sourceType: params.sourceType,
        itemId: params.itemId,
        itemStatus: row?.status ?? "processing",
        inflight: [...this.state.rows.values()],
        lastCampaignSentAtMs: this.state.lastCampaignSentAtMs,
        nowMs: params.nowMs,
        leaseWindowMs: params.leaseWindowMs,
        minGapMs: params.minGapMs,
      });
    } finally {
      this.locked = false;
    }
  }
}

/**
 * Chamada real da trava atômica no banco. FAIL-CLOSED: erro de RPC ou resposta
 * inesperada NUNCA libera envio.
 */
export async function acquireViverCampaignSlot(
  supabase: any,
  item: { id: string; empresa_id: string; source_type?: string | null },
): Promise<ViverSlotOutcome> {
  if (!needsViverCampaignSpacingCheck(item.empresa_id, item.source_type)) {
    return { acquired: true, reason: "not_applicable" };
  }
  const { data, error } = await supabase.rpc("viver_campaign_slot_try_acquire", {
    _empresa_id: item.empresa_id,
    _outbox_id: item.id,
    _lease_seconds: Math.round(VIVER_SLOT_LEASE_MS / 1000),
    _min_gap_seconds: Math.round(VIVER_CAMPAIGN_MIN_GAP_MS / 1000),
  });
  if (error) {
    return {
      acquired: false,
      reason: "slot_rpc_failed",
      retain_reason: RETAIN_REASON_VIVER_SPACING_UNKNOWN,
    };
  }
  const acquired = (data as any)?.acquired === true;
  const reason = String((data as any)?.reason ?? "slot_unknown");
  if (acquired) return { acquired: true, reason };
  const waitSeconds = Number((data as any)?.wait_seconds ?? 0);
  return {
    acquired: false,
    reason,
    wait_ms: Number.isFinite(waitSeconds) && waitSeconds > 0
      ? waitSeconds * 1000
      : undefined,
    retain_reason: reason === "min_gap"
      ? RETAIN_REASON_VIVER_CAMPAIGN_SPACING
      : RETAIN_REASON_VIVER_SLOT_LOCK,
  };
}

/**
 * Execução dirigida (`{ outbox_id, empresa_id }`) não pode contornar a reserva:
 * campanha da Viver é recusada e deve seguir pelo claim normal do lote.
 * `ai_reply` dirigido segue inalterado.
 */
export function refuseTargetedViverCampaign(
  empresaId: unknown,
  sourceType: string | null | undefined,
): boolean {
  return isViverTenant(empresaId) &&
    String(sourceType ?? "") === "campaign";
}
