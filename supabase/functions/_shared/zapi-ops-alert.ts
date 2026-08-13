// Alerta OPERACIONAL de plataforma (não é notificação de tenant).
//
// Diferença em relação a _shared/internal-notification.ts:
//   • internal-notification resolve o destinatário DENTRO do tenant (venda,
//     handoff, lead). Nunca usa número fixo.
//   • aqui o destinatário é a operação da plataforma (Orbit/Fluxrow), fixo e
//     único, porque o evento é de infraestrutura: instância WhatsApp caiu.
//
// REGRAS INVIOLÁVEIS
//  1. Nunca envia token/segredo no texto.
//  2. O REMETENTE precisa ser uma instância INTERNA/MASTER explicitamente
//     configurada. NUNCA usa a instância de um tenant cliente como remetente
//     de alerta de plataforma — se não houver remetente interno saudável, o
//     alerta fica PENDENTE e auditável (retry no próximo ciclo).
//  3. Cooldown/dedupe é responsabilidade de zapi-connection.ts.

import { zapiBaseUrl } from "./zapi-media.ts";
import { sanitizeZapiReason } from "./zapi-connection.ts";

/** Destinatário operacional da plataforma (WhatsApp, dígitos E.164). */
export const ORBIT_OPS_ALERT_WHATSAPP = "5541992361868";

/** Erro persistido quando não existe remetente interno configurado/saudável. */
export const OPS_ALERT_PENDING_ERROR = "ops_alert_pending_no_internal_sender";

/** Slug do tenant interno/master usado por padrão (dedicado, não é cliente). */
export const DEFAULT_INTERNAL_SLUG = "fluxrow";

export interface InternalSenderSelector {
  configId: string | null;
  empresaId: string | null;
  slug: string;
}

/** Seleção EXPLÍCITA do remetente interno (secret/config), nunca heurística. */
export function resolveInternalSenderSelector(
  env: (key: string) => string | undefined,
): InternalSenderSelector {
  const configId = (env("ORBIT_OPS_ALERT_ZAPI_CONFIG_ID") || "").trim() || null;
  const empresaId = (env("ORBIT_OPS_ALERT_EMPRESA_ID") || "").trim() || null;
  const slug = ((env("ORBIT_OPS_ALERT_EMPRESA_SLUG") || "").trim() || DEFAULT_INTERNAL_SLUG)
    .toLowerCase();
  return { configId, empresaId, slug };
}

export interface SenderCandidateRow {
  id?: string | null;
  empresa_id?: string | null;
  instance_id?: string | null;
  ativo?: boolean | null;
  instance_offline?: boolean | null;
  send_block_until?: string | null;
}

/** Candidato só é elegível se ativo, online e sem bloqueio temporal vigente. */
export function isSenderEligible(
  row: SenderCandidateRow | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row || !row.id || !row.instance_id) return false;
  if (row.ativo === false) return false;
  if (row.instance_offline === true) return false;
  const until = row.send_block_until ? Date.parse(row.send_block_until) : NaN;
  if (Number.isFinite(until) && until > now.getTime()) return false;
  return true;
}

interface SenderConfig {
  id: string;
  empresa_id: string | null;
  instance_id: string | null;
  token: string | null;
  client_token: string | null;
}

/**
 * Resolve APENAS o remetente interno configurado. Retorna null (nunca um
 * tenant cliente) quando não houver configuração interna saudável.
 */
async function resolveInternalSender(supabase: any): Promise<SenderConfig | null> {
  const sel = resolveInternalSenderSelector((k) => Deno.env.get(k) ?? undefined);

  const baseSelect = "id, empresa_id, instance_id, ativo, instance_offline, send_block_until";
  let row: SenderCandidateRow | null = null;

  if (sel.configId) {
    const { data } = await supabase
      .from("orbit_zapi_config")
      .select(baseSelect)
      .eq("id", sel.configId)
      .maybeSingle();
    row = (data as SenderCandidateRow | null) ?? null;
  }

  if (!row && sel.empresaId) {
    const { data } = await supabase
      .from("orbit_zapi_config")
      .select(baseSelect)
      .eq("empresa_id", sel.empresaId)
      .eq("ativo", true)
      .maybeSingle();
    row = (data as SenderCandidateRow | null) ?? null;
  }

  if (!row && sel.slug) {
    const { data: empresa } = await supabase
      .from("orbit_empresas")
      .select("id")
      .eq("slug", sel.slug)
      .maybeSingle();
    const internalEmpresaId = (empresa as any)?.id ?? null;
    if (internalEmpresaId) {
      const { data } = await supabase
        .from("orbit_zapi_config")
        .select(baseSelect)
        .eq("empresa_id", internalEmpresaId)
        .eq("ativo", true)
        .maybeSingle();
      row = (data as SenderCandidateRow | null) ?? null;
    }
  }

  if (!isSenderEligible(row)) return null;

  try {
    const { data } = await supabase.rpc("get_orbit_zapi_runtime_config_by_id", {
      p_config_id: row!.id,
    });
    const cfg = (data as any) ?? null;
    if (!cfg?.instance_id || !cfg?.token) return null;
    return {
      id: row!.id as string,
      empresa_id: row!.empresa_id ?? null,
      instance_id: cfg.instance_id,
      token: cfg.token,
      client_token: cfg.client_token ?? null,
    };
  } catch (_e) {
    return null;
  }
}

export interface OpsAlertInput {
  empresa_id: string | null;
  empresa_nome?: string | null;
  instance_id: string | null;
  reason: string;
  event_type: string;
  status_code?: number | null;
  send_block_until?: string | null;
}

export function buildOfflineAlertMessage(input: OpsAlertInput): string {
  const lines = [
    "🚨 Orbit — WhatsApp desconectado",
    `Tenant: ${input.empresa_nome || input.empresa_id || "desconhecido"}`,
    `Instance ID: ${input.instance_id || "n/d"}`,
    `Evento: ${input.event_type}${input.status_code ? ` (HTTP ${input.status_code})` : ""}`,
    `Motivo: ${sanitizeZapiReason(input.reason, 200)}`,
  ];
  if (input.send_block_until) lines.push(`Envio bloqueado até: ${input.send_block_until}`);
  lines.push("Envios reais deste tenant estão travados (fail-closed) até a reconexão.");
  return lines.join("\n");
}

/** Envia o alerta operacional. Nunca lança — falha vira alert_last_error. */
export async function sendOpsOfflineAlert(
  supabase: any,
  input: OpsAlertInput,
): Promise<{ sent: boolean; pending?: boolean; error?: string }> {
  try {
    let empresaNome = input.empresa_nome ?? null;
    if (!empresaNome && input.empresa_id) {
      const { data } = await supabase
        .from("orbit_empresas")
        .select("nome")
        .eq("id", input.empresa_id)
        .maybeSingle();
      empresaNome = (data as any)?.nome ?? null;
    }

    const sender = await resolveInternalSender(supabase);
    if (!sender) {
      // Fail-safe: NÃO cai para instância de cliente. Alerta fica pendente.
      console.warn("[zapi-ops-alert] sem remetente interno configurado — alerta PENDENTE");
      return { sent: false, pending: true, error: OPS_ALERT_PENDING_ERROR };
    }

    const resp = await fetch(`${zapiBaseUrl(sender)}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": sender.client_token || "",
      },
      body: JSON.stringify({
        phone: ORBIT_OPS_ALERT_WHATSAPP,
        message: buildOfflineAlertMessage({ ...input, empresa_nome: empresaNome }),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { sent: false, error: `alert_send_failed_${resp.status}: ${sanitizeZapiReason(text, 160)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: sanitizeZapiReason(e instanceof Error ? e.message : String(e), 160) };
  }
}
