// Ponto ÚNICO de execução de envio Z-API (texto e mídia).
//
// Responsabilidades:
//   • assinar a mídia no momento do envio (TTL longo, nunca URL expirada);
//   • escolher endpoint correto por tipo (handler de mídia isolado do texto);
//   • classificar falhas de conexão (401/403/sessão perdida/block) e marcar a
//     instância como offline com alerta operacional — fail-closed global.
//
// NÃO decide elegibilidade/quota: isso é do worker da outbox.

import { signOrbitMediaUrl } from "./orbit-media.ts";
import {
  buildZapiRequest,
  isMediaKind,
  zapiBaseUrl,
  MEDIA_SIGNED_URL_TTL_SECONDS,
  type ZapiPayloadKind,
} from "./zapi-media.ts";
import {
  classifyZapiFailure,
  markZapiInstanceOffline,
  markOfflineAlertSent,
  sanitizeZapiReason,
} from "./zapi-connection.ts";
import { sendOpsOfflineAlert } from "./zapi-ops-alert.ts";

export interface ZapiSendConfig {
  id?: string | null;
  empresa_id?: string | null;
  instance_id?: string | null;
  token?: string | null;
  client_token?: string | null;
}

export interface ZapiSendInput {
  phone: string;
  kind: ZapiPayloadKind;
  /** Texto da mensagem ou legenda da mídia. */
  message?: string | null;
  /** storage_path (preferido) ou URL de mídia. */
  mediaSource?: string | null;
  payload?: Record<string, unknown> | null;
  functionName: string;
}

export interface ZapiSendResult {
  ok: boolean;
  providerId?: string | null;
  error?: string;
  /** Endpoint efetivo (audio degradado para document aparece aqui). */
  effectiveKind?: ZapiPayloadKind;
  status?: number | null;
  /** Instância foi marcada offline por esta falha. */
  instanceOffline?: boolean;
}

async function handleConnectionFailure(
  supabase: any,
  cfg: ZapiSendConfig,
  functionName: string,
  status: number | null,
  body: unknown,
): Promise<{ offline: boolean; reason: string }> {
  const cls = classifyZapiFailure(status, body);
  if (!cls.offline && !cls.blockSeconds) return { offline: false, reason: cls.reason };

  const marked = await markZapiInstanceOffline(supabase, {
    empresa_id: cfg.empresa_id ?? null,
    zapi_config_id: cfg.id ?? null,
    instance_id: cfg.instance_id ?? null,
    reason: `${functionName}: ${cls.reason}`,
    source: "send",
    event_type: cls.event_type,
    status_code: status,
    blockSeconds: cls.blockSeconds,
    offline: cls.offline,
  });

  if (marked.shouldAlert) {
    const alert = await sendOpsOfflineAlert(supabase, {
      empresa_id: marked.empresa_id,
      instance_id: marked.instance_id,
      reason: cls.reason,
      event_type: cls.event_type,
      status_code: status,
      event_id: marked.event_id,
    });
    await markOfflineAlertSent(supabase, {
      config_id: marked.config_id,
      event_id: marked.event_id,
      error: alert.sent ? null : alert.error ?? "alert_failed",
      channel: alert.channel,
      provider_message_id: alert.provider_message_id ?? null,
      idempotency_key: alert.idempotency_key,
    });
  }

  return { offline: cls.offline, reason: cls.reason };
}

/**
 * Executa o envio. Assume que TODOS os gates (kill switch, quota, hold,
 * instância online) já foram avaliados pelo chamador.
 */
export async function sendViaZapiUnified(
  supabase: any,
  cfg: ZapiSendConfig,
  input: ZapiSendInput,
): Promise<ZapiSendResult> {
  if (!cfg.instance_id || !cfg.token) {
    return { ok: false, error: "zapi_config_missing" };
  }

  const base = zapiBaseUrl(cfg);
  let mediaUrl: string | null = null;

  if (isMediaKind(input.kind)) {
    if (!input.mediaSource) {
      return { ok: false, error: "media_url_unresolved", effectiveKind: input.kind };
    }
    const signed = await signOrbitMediaUrl(supabase, input.mediaSource, MEDIA_SIGNED_URL_TTL_SECONDS);
    mediaUrl = typeof signed === "string" ? signed : null;
    if (!mediaUrl || !/^https:\/\//i.test(mediaUrl)) {
      return { ok: false, error: "media_url_unresolved", effectiveKind: input.kind };
    }
  }

  const spec = buildZapiRequest({
    base,
    phone: input.phone,
    kind: input.kind,
    caption: input.message ?? "",
    mediaUrl,
    mediaSource: input.mediaSource ?? null,
    payload: input.payload ?? null,
  });

  if (!spec) {
    return { ok: false, error: "media_url_unresolved", effectiveKind: input.kind };
  }

  try {
    const resp = await fetch(spec.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": cfg.client_token || "",
      },
      body: JSON.stringify(spec.body),
    });
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const conn = await handleConnectionFailure(supabase, cfg, input.functionName, resp.status, json);
      return {
        ok: false,
        status: resp.status,
        effectiveKind: spec.kind,
        instanceOffline: conn.offline,
        error: `Z-API ${resp.status}: ${sanitizeZapiReason(json, 300)}`,
      };
    }

    return { ok: true, providerId: (json as any)?.messageId ?? null, effectiveKind: spec.kind, status: resp.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Z-API exception: ${sanitizeZapiReason(message, 200)}`, effectiveKind: spec.kind };
  }
}
