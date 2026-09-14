/**
 * Status de campanha permitidos pelo banco (`orbit_campaigns_status_check`).
 *
 * Incidente 2026-09-14 (Viver): o abort por Z-API desconectada gravava
 * `status='falha'`, valor REJEITADO pela CHECK constraint. O erro do UPDATE era
 * ignorado, a campanha ficava presa em `enviando` com destinatários pendentes e o
 * auto-resume a reinvocava a cada minuto para sempre.
 *
 * Este módulo é puro (mapeamento) + um único helper de I/O que VERIFICA o erro
 * do UPDATE, para que uma transição inválida nunca volte a passar em silêncio.
 */

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

/**
 * Estado alvo por motivo de abort:
 *  • `ZAPI_DISCONNECTED` é transitório → `agendada`, retomável pelo claim normal
 *    (mesmos gates, mesma janela, mesmo dia operacional). Sem envio direto.
 *  • bloqueios de política/kill-switch e "tudo falhou" → `pausada` (fail-closed,
 *    sem auto-resume; exige decisão humana).
 */
export function campaignStatusForAbort(reason: CampaignAbortReason): CampaignStatus {
  switch (reason) {
    case "ZAPI_DISCONNECTED":
      return "agendada";
    default:
      return "pausada";
  }
}

export interface CampaignStatusUpdateResult {
  applied: boolean;
  status: string;
  error?: string;
}

/** Cliente mínimo (stubável) para o update de status. */
export interface CampaignStatusUpdateClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ error: { message?: string } | null }>;
    };
  };
}

/**
 * Aplica o status verificando validade e erro do banco. Fail-loud: status
 * inválido nunca é enviado ao banco e o erro é sempre devolvido/logável.
 */
export async function updateCampaignStatus(
  client: CampaignStatusUpdateClient,
  args: { campaign_id: string; status: string; motivo_reprovacao?: string | null },
): Promise<CampaignStatusUpdateResult> {
  if (!isValidCampaignStatus(args.status)) {
    return { applied: false, status: args.status, error: "invalid_campaign_status" };
  }
  const values: Record<string, unknown> = { status: args.status };
  if (args.motivo_reprovacao !== undefined) {
    values.motivo_reprovacao = args.motivo_reprovacao;
  }
  const { error } = await client
    .from("orbit_campaigns")
    .update(values)
    .eq("id", args.campaign_id);
  if (error) {
    return { applied: false, status: args.status, error: String(error.message ?? "update_failed") };
  }
  return { applied: true, status: args.status };
}
