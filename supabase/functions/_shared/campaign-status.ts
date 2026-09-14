/**
 * Status de campanha permitidos pelo banco (`orbit_campaigns_status_check`).
 *
 * Incidente 2026-09-14 (tenant Viver): o abort por Z-API desconectada gravava
 * `status='falha'`, valor REJEITADO pela CHECK constraint. O erro do UPDATE era
 * ignorado, a campanha ficava presa em `enviando` com destinatários pendentes e o
 * auto-resume a reinvocava a cada minuto para sempre.
 *
 * ESCOPO DA MUDANÇA DE COMPORTAMENTO: somente o tenant Viver. Para qualquer
 * outro tenant o mapeamento legado é preservado byte a byte (inclusive o valor
 * `falha`), de modo que nenhuma semântica existente muda fora da Viver.
 *
 * Este módulo é puro (mapeamento) + um único helper de I/O que aplica o UPDATE
 * com escopo de tenant obrigatório e compare-and-swap de estado esperado,
 * confirmando a linha afetada — nunca mais "applied" sem linha alterada e nunca
 * desfazendo uma pausa/cancelamento concorrente.
 */

import { VIVER_EMPRESA_ID } from "./tenant-scheduling-policy.ts";

export const CAMPAIGN_STATUSES = [
  "rascunho",
  "agendada",
  "enviando",
  "concluida",
  "pausada",
  "cancelada",
  "pendente_aprovacao",
  "aprovada",
  "reprovada",
  "em_revisao",
  "aprovada_para_envio",
  "pausada_por_limite",
] as const;

export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export function isValidCampaignStatus(value: unknown): value is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(String(value ?? ""));
}

/** Motivos de abort antes do enqueue (nenhum envio aconteceu). */
export type CampaignAbortReason =
  | "ZAPI_DISCONNECTED"
  | "ZAPI_REAL_SEND_BLOCKED"
  | "WHATSAPP_RHYTHM_DISABLED"
  | "CAMPAIGN_ALL_FAILED";

/** Comportamento histórico, mantido para todos os tenants exceto Viver. */
const LEGACY_ABORT_STATUS: Record<CampaignAbortReason, string> = {
  ZAPI_DISCONNECTED: "falha",
  ZAPI_REAL_SEND_BLOCKED: "falha",
  CAMPAIGN_ALL_FAILED: "falha",
  WHATSAPP_RHYTHM_DISABLED: "pausada",
};

export function isViverCampaignTenant(empresaId: unknown): boolean {
  return String(empresaId ?? "") === VIVER_EMPRESA_ID;
}

/**
 * Estado alvo por motivo de abort — SOMENTE Viver:
 *  • `ZAPI_DISCONNECTED` é transitório → `agendada`, retomável pelo claim normal
 *    (mesmos gates: 15 campanhas/dia, gap de 30 min, data operacional). Nunca
 *    envia direto e nunca libera hold.
 *  • bloqueios de política/kill-switch e "tudo falhou" → `pausada` (fail-closed,
 *    sem auto-resume; exige decisão humana).
 * Outros tenants: mapeamento legado inalterado.
 */
export function campaignStatusForAbort(
  reason: CampaignAbortReason,
  opts?: { empresaId?: unknown },
): string {
  if (!isViverCampaignTenant(opts?.empresaId)) return LEGACY_ABORT_STATUS[reason];
  return reason === "ZAPI_DISCONNECTED" ? "agendada" : "pausada";
}

export interface CampaignStatusUpdateResult {
  applied: boolean;
  status: string;
  error?: string;
}

/** Cliente mínimo (stubável) para o update de status com filtros encadeados. */
export interface CampaignStatusFilterBuilder {
  eq(column: string, value: unknown): CampaignStatusFilterBuilder;
  in(column: string, values: readonly unknown[]): CampaignStatusFilterBuilder;
  select(columns: string): Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
}

export interface CampaignStatusUpdateClient {
  from(table: string): { update(values: Record<string, unknown>): CampaignStatusFilterBuilder };
}

/**
 * Aplica o status com:
 *  • escopo de tenant obrigatório (`empresa_id`);
 *  • compare-and-swap opcional (`expectedStatus`) para não sobrescrever pausa,
 *    cancelamento ou qualquer transição concorrente;
 *  • confirmação por linha retornada — zero rows ⇒ `applied:false`.
 * Fail-loud: status inválido nunca é enviado ao banco e o erro é sempre devolvido.
 */
export async function updateCampaignStatus(
  client: CampaignStatusUpdateClient,
  args: {
    campaign_id: string;
    empresa_id: string;
    status: string;
    motivo_reprovacao?: string | null;
    /** Estados aceitos como ponto de partida (CAS). Vazio/omitido = sem CAS. */
    expectedStatus?: readonly string[];
  },
): Promise<CampaignStatusUpdateResult> {
  if (!args.empresa_id) {
    return { applied: false, status: args.status, error: "missing_empresa_id" };
  }
  if (!isValidCampaignStatus(args.status)) {
    return { applied: false, status: args.status, error: "invalid_campaign_status" };
  }
  const values: Record<string, unknown> = { status: args.status };
  if (args.motivo_reprovacao !== undefined) {
    values.motivo_reprovacao = args.motivo_reprovacao;
  }
  let query = client
    .from("orbit_campaigns")
    .update(values)
    .eq("id", args.campaign_id)
    .eq("empresa_id", args.empresa_id);
  if (args.expectedStatus && args.expectedStatus.length > 0) {
    query = query.in("status", args.expectedStatus);
  }
  const { data, error } = await query.select("id");
  if (error) {
    return { applied: false, status: args.status, error: String(error.message ?? "update_failed") };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { applied: false, status: args.status, error: "no_rows_matched" };
  }
  return { applied: true, status: args.status };
}
