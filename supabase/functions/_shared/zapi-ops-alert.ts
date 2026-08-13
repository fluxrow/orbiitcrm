// Alerta OPERACIONAL de plataforma (não é notificação de tenant).
//
// CANAL ÚNICO: E-MAIL (Resend, via _shared/system-email.ts).
//   • NÃO existe fallback Telegram (nunca existiu e não deve ser adicionado).
//   • NÃO usa Z-API/WhatsApp de tenant como canal operacional — instância de
//     cliente jamais é remetente de alerta de plataforma.
//
// REGRAS INVIOLÁVEIS
//  1. Nunca envia token/segredo no texto (sanitizeZapiReason + máscara de URL).
//  2. Destinatário é a operação da plataforma (constante de configuração,
//     sobrescrevível por secret ORBIT_OPS_ALERT_EMAIL).
//  3. alert_sent só vira true após resposta ACEITA do provedor.
//  4. Idempotência por event_id (Idempotency-Key no provedor + coluna
//     alert_idempotency_key na tabela de eventos).

import { sanitizeZapiReason } from "./zapi-connection.ts";
import { getSystemEmailConfig } from "./system-email.ts";

/**
 * Destinatário operacional da plataforma.
 * ORIGEM: constante de configuração deste módulo (não é segredo — é apenas um
 * endereço de e-mail). Pode ser sobrescrito pelo secret `ORBIT_OPS_ALERT_EMAIL`
 * sem redeploy de código.
 */
export const ORBIT_OPS_ALERT_EMAIL_DEFAULT = "fbcfarias@icloud.com";

/** Canal persistido em orbit_zapi_status_events.alert_channel. */
export const OPS_ALERT_CHANNEL = "email";

/** Erro persistido quando o provedor de e-mail não está configurado. */
export const OPS_ALERT_PENDING_ERROR = "ops_alert_pending_email_provider_not_configured";

/** Fallback Telegram é explicitamente proibido. */
export const OPS_ALERT_TELEGRAM_ENABLED = false;

export function resolveOpsAlertRecipient(
  env: (key: string) => string | undefined = (k) => Deno.env.get(k) ?? undefined,
): string {
  const override = (env("ORBIT_OPS_ALERT_EMAIL") || "").trim();
  return override || ORBIT_OPS_ALERT_EMAIL_DEFAULT;
}

export interface OpsAlertInput {
  empresa_id: string | null;
  empresa_nome?: string | null;
  instance_id: string | null;
  reason: string;
  event_type: string;
  status_code?: number | null;
  send_block_until?: string | null;
  /** ID do evento em orbit_zapi_status_events — base da idempotência. */
  event_id?: string | null;
  occurred_at?: string | null;
}

/** Mostra apenas prefixo/sufixo do Instance ID — nunca o token. */
export function maskInstanceId(instanceId: string | null | undefined): string {
  const v = (instanceId || "").trim();
  if (!v) return "n/d";
  if (v.length <= 10) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export function opsAlertIdempotencyKey(input: OpsAlertInput): string {
  const base = input.event_id ||
    `${input.empresa_id || "sem-empresa"}:${input.instance_id || "sem-instancia"}:${input.event_type}`;
  return `zapi-ops-alert:${base}`;
}

export interface OpsAlertEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildOpsAlertEmail(input: OpsAlertInput): OpsAlertEmail {
  const tenant = input.empresa_nome || input.empresa_id || "desconhecido";
  const when = input.occurred_at || new Date().toISOString();
  const rows: Array<[string, string]> = [
    ["Tenant / Empresa", tenant],
    ["Empresa ID", input.empresa_id || "n/d"],
    ["Instance ID", maskInstanceId(input.instance_id)],
    ["Evento", `${input.event_type}${input.status_code ? ` (HTTP ${input.status_code})` : ""}`],
    ["Motivo", sanitizeZapiReason(input.reason, 200)],
    ["Timestamp (UTC)", when],
    ["Correlation / Event ID", input.event_id || "n/d"],
  ];
  if (input.send_block_until) rows.push(["Envio bloqueado até", input.send_block_until]);

  const subject = `🚨 Orbit — WhatsApp desconectado (${tenant})`;
  const text = [
    "Orbit — alerta operacional: WhatsApp desconectado",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Envios reais deste tenant estão travados (fail-closed) até a reconexão.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<h2 style="margin:0 0 12px">🚨 Orbit — WhatsApp desconectado</h2>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
${rows.map(([k, v]) =>
    `<tr><td style="border:1px solid #e5e5e5;font-weight:bold">${escapeHtml(k)}</td><td style="border:1px solid #e5e5e5">${escapeHtml(v)}</td></tr>`
  ).join("")}
</table>
<p style="margin-top:16px">Envios reais deste tenant estão travados (fail-closed) até a reconexão.</p>
</div>`;
  return { subject, text, html };
}

/** Compatibilidade: corpo textual do alerta (usado em testes/auditoria). */
export function buildOfflineAlertMessage(input: OpsAlertInput): string {
  return buildOpsAlertEmail(input).text;
}

export interface OpsAlertResult {
  sent: boolean;
  pending?: boolean;
  error?: string;
  channel: string;
  provider?: string;
  provider_message_id?: string | null;
  idempotency_key: string;
  recipient?: string;
}

/** Envia o alerta operacional por e-mail. Nunca lança — falha vira alert_last_error. */
export async function sendOpsOfflineAlert(
  supabase: any,
  input: OpsAlertInput,
): Promise<OpsAlertResult> {
  const idempotency_key = opsAlertIdempotencyKey(input);
  const base = { channel: OPS_ALERT_CHANNEL, provider: "resend", idempotency_key };
  try {
    // Idempotência: evento já alertado não reenvia.
    if (input.event_id) {
      const { data: existing } = await supabase
        .from("orbit_zapi_status_events")
        .select("alert_sent, alert_provider_message_id")
        .eq("id", input.event_id)
        .maybeSingle();
      if ((existing as any)?.alert_sent === true) {
        return {
          ...base,
          sent: true,
          provider_message_id: (existing as any)?.alert_provider_message_id ?? null,
          recipient: resolveOpsAlertRecipient(),
        };
      }
    }

    let empresaNome = input.empresa_nome ?? null;
    if (!empresaNome && input.empresa_id) {
      const { data } = await supabase
        .from("orbit_empresas")
        .select("nome")
        .eq("id", input.empresa_id)
        .maybeSingle();
      empresaNome = (data as any)?.nome ?? null;
    }

    const cfg = await getSystemEmailConfig(supabase);
    if (!cfg.apiKey) {
      console.warn("[zapi-ops-alert] provedor de e-mail não configurado — alerta PENDENTE");
      return { ...base, sent: false, pending: true, error: OPS_ALERT_PENDING_ERROR };
    }

    const recipient = resolveOpsAlertRecipient();
    const mail = buildOpsAlertEmail({ ...input, empresa_nome: empresaNome });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotency_key,
      },
      body: JSON.stringify({
        from: cfg.fromEmail,
        to: [recipient],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = sanitizeZapiReason(
        typeof (json as any)?.message === "string" ? (json as any).message : JSON.stringify(json ?? {}),
        160,
      );
      return { ...base, sent: false, error: `alert_email_failed_${resp.status}: ${detail}`, recipient };
    }

    return { ...base, sent: true, provider_message_id: (json as any)?.id ?? null, recipient };
  } catch (e) {
    return {
      ...base,
      sent: false,
      error: sanitizeZapiReason(e instanceof Error ? e.message : String(e), 160),
    };
  }
}
