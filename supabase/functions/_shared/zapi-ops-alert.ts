// Alerta OPERACIONAL de plataforma (não é notificação de tenant).
//
// Diferença em relação a _shared/internal-notification.ts:
//   • internal-notification resolve o destinatário DENTRO do tenant (venda,
//     handoff, lead). Nunca usa número fixo.
//   • aqui o destinatário é a operação da plataforma (Orbit/Fluxrow), fixo e
//     único, porque o evento é de infraestrutura: instância WhatsApp caiu.
//
// REGRAS
//  1. Nunca envia token/segredo no texto.
//  2. Usa uma instância SAUDÁVEL como remetente (a do tenant afetado está caída).
//     Preferência: instância do tenant master (slug fluxrow) → qualquer saudável.
//  3. Cooldown/dedupe é responsabilidade de zapi-connection.ts.

import { zapiBaseUrl } from "./zapi-media.ts";
import { sanitizeZapiReason } from "./zapi-connection.ts";

/** Destinatário operacional da plataforma (WhatsApp, dígitos E.164). */
export const ORBIT_OPS_ALERT_WHATSAPP = "5541992361868";

const MASTER_SLUG = "fluxrow";

interface SenderConfig {
  id: string;
  empresa_id: string | null;
  instance_id: string | null;
  token: string | null;
  client_token: string | null;
}

async function resolveHealthySender(
  supabase: any,
  excludeEmpresaId: string | null,
): Promise<SenderConfig | null> {
  const nowIso = new Date().toISOString();
  const { data: candidates } = await supabase
    .from("orbit_zapi_config")
    .select("id, empresa_id, instance_id")
    .eq("ativo", true)
    .eq("envio_real_liberado", true)
    .eq("instance_offline", false)
    .or(`send_block_until.is.null,send_block_until.lte.${nowIso}`);

  const rows = ((candidates as any[]) ?? []).filter((c) => c.instance_id);
  if (!rows.length) return null;

  // Preferir tenant master, depois qualquer tenant diferente do afetado.
  const empresaIds = rows.map((r) => r.empresa_id).filter(Boolean);
  let masterId: string | null = null;
  if (empresaIds.length) {
    const { data: empresas } = await supabase
      .from("orbit_empresas")
      .select("id, slug")
      .in("id", empresaIds);
    masterId = ((empresas as any[]) ?? []).find((e) => e.slug === MASTER_SLUG)?.id ?? null;
  }

  const ordered = [
    ...rows.filter((r) => masterId && r.empresa_id === masterId),
    ...rows.filter((r) => r.empresa_id !== excludeEmpresaId && r.empresa_id !== masterId),
    ...rows.filter((r) => r.empresa_id === excludeEmpresaId),
  ];

  for (const row of ordered) {
    try {
      const { data } = await supabase.rpc("get_orbit_zapi_runtime_config_by_id", { p_config_id: row.id });
      const cfg = (data as any) ?? null;
      if (cfg?.instance_id && cfg?.token) {
        return {
          id: row.id,
          empresa_id: row.empresa_id,
          instance_id: cfg.instance_id,
          token: cfg.token,
          client_token: cfg.client_token ?? null,
        };
      }
    } catch (_e) {
      // Ignora e tenta o próximo candidato.
    }
  }
  return null;
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
): Promise<{ sent: boolean; error?: string }> {
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

    const sender = await resolveHealthySender(supabase, input.empresa_id);
    if (!sender) return { sent: false, error: "nenhuma instancia saudavel para enviar alerta" };

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
