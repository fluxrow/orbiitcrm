import {
  looksLikeInternalPayload,
  sanitizedLeakSummary,
} from "./ai-output-guard.ts";
import { normalizeZapiPhoneDigits } from "./orbit-zapi.ts";

export interface OrbitMetaWhatsAppRuntimeConfig {
  id: string;
  empresa_id: string;
  waba_id: string | null;
  phone_number_id: string | null;
  graph_api_version: string;
  webhook_verify_token: string;
  access_token: string | null;
  app_secret: string | null;
  ativo: boolean;
  envio_real_liberado: boolean;
  canary_mode_enabled: boolean;
  canary_phone_numbers: string[];
  allow_proactive_messages: boolean;
  activated_at: string | null;
}

export interface MetaWhatsAppSendResult {
  ok: boolean;
  providerId?: string | null;
  error?: string;
  status?: number | null;
}

export const META_WHATSAPP_PROVIDER = "meta_whatsapp";
export const META_WHATSAPP_BLOCK_INACTIVE = "META_WHATSAPP_PROVIDER_INACTIVE";
export const META_WHATSAPP_BLOCK_REAL_SEND = "META_WHATSAPP_REAL_SEND_BLOCKED";
export const META_WHATSAPP_BLOCK_CANARY =
  "META_WHATSAPP_CANARY_RECIPIENT_BLOCKED";
export const META_WHATSAPP_BLOCK_PROACTIVE = "META_WHATSAPP_PROACTIVE_BLOCKED";
export const META_WHATSAPP_BLOCK_TEMPLATE_REQUIRED =
  "META_WHATSAPP_TEMPLATE_REQUIRED_OUTSIDE_24H";
export const META_WHATSAPP_BLOCK_UNSUPPORTED_MEDIA =
  "META_WHATSAPP_UNSUPPORTED_MEDIA";
export const META_WHATSAPP_BLOCK_PRE_ACTIVATION =
  "META_WHATSAPP_PRE_ACTIVATION_BACKLOG";

const PROACTIVE_SOURCES = new Set([
  "campaign",
  "flow_initial",
  "flow_followup",
]);

export async function getOrbitMetaWhatsAppRuntimeConfig(
  supabase: any,
  empresaId: string,
): Promise<OrbitMetaWhatsAppRuntimeConfig | null> {
  const { data, error } = await supabase.rpc(
    "get_orbit_meta_whatsapp_runtime_config",
    { p_empresa_id: empresaId },
  );
  if (error) {
    // A migração pode ainda não ter sido publicada. Nesse caso, preservar o
    // provedor atual em vez de derrubar o worker inteiro.
    if (
      String(error.code ?? "") === "PGRST202" ||
      /get_orbit_meta_whatsapp_runtime_config|schema cache/i.test(
        String(error.message ?? ""),
      )
    ) return null;
    throw error;
  }
  return (data as OrbitMetaWhatsAppRuntimeConfig | null) ?? null;
}

export function isMetaWhatsAppReady(
  config: OrbitMetaWhatsAppRuntimeConfig | null | undefined,
): config is OrbitMetaWhatsAppRuntimeConfig {
  return !!(
    config?.ativo === true &&
    config.phone_number_id &&
    config.access_token &&
    config.app_secret
  );
}

export function isMetaWhatsAppCanaryRecipient(
  config: Pick<
    OrbitMetaWhatsAppRuntimeConfig,
    "canary_mode_enabled" | "canary_phone_numbers"
  >,
  phone: unknown,
): boolean {
  if (config.canary_mode_enabled !== true) return false;
  const target = normalizeZapiPhoneDigits(phone);
  return !!target && (config.canary_phone_numbers ?? []).some(
    (candidate) => normalizeZapiPhoneDigits(candidate) === target,
  );
}

export function metaWhatsAppSendBlockReason(
  config: OrbitMetaWhatsAppRuntimeConfig | null | undefined,
  phone: unknown,
  sourceType: unknown,
): string | null {
  if (!isMetaWhatsAppReady(config)) return META_WHATSAPP_BLOCK_INACTIVE;
  if (
    config.envio_real_liberado !== true &&
    !isMetaWhatsAppCanaryRecipient(config, phone)
  ) {
    return config.canary_mode_enabled
      ? META_WHATSAPP_BLOCK_CANARY
      : META_WHATSAPP_BLOCK_REAL_SEND;
  }
  if (
    PROACTIVE_SOURCES.has(String(sourceType ?? "")) &&
    config.allow_proactive_messages !== true
  ) {
    return META_WHATSAPP_BLOCK_PROACTIVE;
  }
  return null;
}

export function isInsideMetaCustomerServiceWindow(
  latestInboundAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!latestInboundAt) return false;
  const receivedAt = Date.parse(latestInboundAt);
  if (!Number.isFinite(receivedAt)) return false;
  const age = now.getTime() - receivedAt;
  return age >= 0 && age <= 24 * 60 * 60 * 1000;
}

export function isMetaPreActivationBacklog(
  createdAt: string | null | undefined,
  activatedAt: string | null | undefined,
): boolean {
  if (!createdAt || !activatedAt) return true;
  const created = Date.parse(createdAt);
  const activated = Date.parse(activatedAt);
  if (!Number.isFinite(created) || !Number.isFinite(activated)) return true;
  return created < activated;
}

export function buildMetaWhatsAppRequestBody(args: {
  phone: unknown;
  message?: string | null;
  template?: {
    name?: string;
    language_code?: string;
    components?: unknown[];
  } | null;
  insideCustomerWindow: boolean;
}): { body: Record<string, unknown> | null; error?: string } {
  const to = normalizeZapiPhoneDigits(args.phone);
  if (!to) return { body: null, error: "META_WHATSAPP_INVALID_PHONE" };

  const templateName = String(args.template?.name ?? "").trim();
  if (!args.insideCustomerWindow) {
    if (!templateName) {
      return { body: null, error: META_WHATSAPP_BLOCK_TEMPLATE_REQUIRED };
    }
    return {
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: String(args.template?.language_code ?? "pt_BR") },
          ...(Array.isArray(args.template?.components)
            ? { components: args.template!.components }
            : {}),
        },
      },
    };
  }

  const message = String(args.message ?? "").trim();
  if (!message) return { body: null, error: "META_WHATSAPP_EMPTY_MESSAGE" };
  if (looksLikeInternalPayload(message)) {
    console.error(
      "[meta-whatsapp] internal payload blocked",
      sanitizedLeakSummary(message),
    );
    return { body: null, error: "internal_payload_blocked" };
  }
  return {
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: message },
    },
  };
}

export async function sendViaMetaWhatsApp(
  config: OrbitMetaWhatsAppRuntimeConfig,
  args: {
    phone: unknown;
    sourceType: unknown;
    payloadType: unknown;
    message?: string | null;
    template?: {
      name?: string;
      language_code?: string;
      components?: unknown[];
    } | null;
    insideCustomerWindow: boolean;
  },
  fetcher: typeof fetch = fetch,
): Promise<MetaWhatsAppSendResult> {
  const blocked = metaWhatsAppSendBlockReason(
    config,
    args.phone,
    args.sourceType,
  );
  if (blocked) return { ok: false, error: blocked };
  if (String(args.payloadType ?? "text") !== "text" && !args.template?.name) {
    return { ok: false, error: META_WHATSAPP_BLOCK_UNSUPPORTED_MEDIA };
  }

  const spec = buildMetaWhatsAppRequestBody({
    phone: args.phone,
    message: args.message,
    template: args.template,
    insideCustomerWindow: args.insideCustomerWindow,
  });
  if (!spec.body) {
    return { ok: false, error: spec.error ?? "META_WHATSAPP_INVALID_PAYLOAD" };
  }

  const version = /^v\d+[.]\d+$/.test(config.graph_api_version)
    ? config.graph_api_version
    : "v25.0";
  const url = `https://graph.facebook.com/${version}/${
    encodeURIComponent(config.phone_number_id!)
  }/messages`;
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(spec.body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = Number((json as any)?.error?.code ?? 0) || null;
      const subcode = Number((json as any)?.error?.error_subcode ?? 0) || null;
      return {
        ok: false,
        status: response.status,
        error: `META_WHATSAPP_HTTP_${response.status}${
          code ? `_CODE_${code}` : ""
        }${subcode ? `_SUBCODE_${subcode}` : ""}`,
      };
    }
    const providerId = (json as any)?.messages?.[0]?.id ?? null;
    if (!providerId) {
      return {
        ok: false,
        status: response.status,
        error: "META_WHATSAPP_PROVIDER_ID_MISSING",
      };
    }
    return { ok: true, status: response.status, providerId };
  } catch (_error) {
    return { ok: false, error: "META_WHATSAPP_NETWORK_ERROR" };
  }
}

export function extractMetaPhoneNumberIds(payload: any): string[] {
  const ids = new Set<string>();
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const id = String(change?.value?.metadata?.phone_number_id ?? "").trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export async function verifyMetaHmacSha256(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const supplied = signatureHeader.slice(7).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)),
  );
  const expected = [...digest].map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  let diff = expected.length ^ supplied.length;
  for (let i = 0; i < Math.min(expected.length, supplied.length); i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}

export function metaMessageToOrbitPayload(
  message: any,
  phoneNumberId: string,
): Record<string, unknown> | null {
  if (!message?.id || !message?.from) return null;
  if (message.type !== "text" || !String(message?.text?.body ?? "").trim()) {
    return null;
  }
  const timestampSeconds = Number(message.timestamp ?? 0);
  return {
    instanceId: phoneNumberId,
    phone: String(message.from),
    messageId: String(message.id),
    fromMe: false,
    fromApi: false,
    type: "ReceivedCallback",
    momment: Number.isFinite(timestampSeconds) && timestampSeconds > 0
      ? timestampSeconds * 1000
      : Date.now(),
    text: { message: String(message.text.body) },
    provider: META_WHATSAPP_PROVIDER,
  };
}
