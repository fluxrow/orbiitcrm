// Identidade e classificação do inbound Z-API (helpers puros, testáveis).
//
// Regras invioláveis:
//  • `connectedPhone` é o número DO TENANT — nunca é telefone do lead.
//  • `@lid` NUNCA é telefone e nunca é convertido em dígitos de telefone.
//  • LID só resolve para um lead via mapeamento tenant-scoped já correlacionado.
//  • fromMe=true + fromApi=false ⇒ OUT externa (atendente falou pelo celular).
//  • fromApi=true ⇒ mensagem originada no Orbit: apenas dedupe, nunca OUT nova.

import type { ZapiPayload } from "./inbound-zapi.ts";

const LID_SUFFIX = "@lid";

/** Normaliza dígitos E.164 BR-friendly. Retorna null se não for telefone plausível. */
export function normalizeTrustedPhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw);
  if (value.includes(LID_SUFFIX) || value.includes("@g.us") || value.includes("@newsletter")) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/** Telefone confiável do interlocutor: phone/from numéricos, participantPhone ou chatId @c.us. */
export function extractTrustedPhone(payload: ZapiPayload): string | null {
  const candidates: unknown[] = [
    (payload as Record<string, unknown>).participantPhone,
    payload.phone,
    payload.from,
  ];
  const chatId = (payload as Record<string, unknown>).chatId;
  if (typeof chatId === "string" && chatId.endsWith("@c.us")) {
    candidates.push(chatId.replace("@c.us", ""));
  }
  for (const candidate of candidates) {
    const phone = normalizeTrustedPhone(candidate);
    if (phone) return phone;
  }
  return null;
}

/** LID observado no payload (identificador interno do WhatsApp, nunca telefone). */
export function extractLid(payload: ZapiPayload): string | null {
  const p = payload as Record<string, unknown>;
  const candidates = [p.chatLid, p.senderLid, p.participantLid, p.phone, p.from, p.chatId];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    if (raw.endsWith(LID_SUFFIX)) return raw;
  }
  return null;
}

export type ZapiInboundKind = "inbound" | "external_out" | "orbit_echo" | "status_callback" | "ignore";

export interface ZapiInboundClassification {
  kind: ZapiInboundKind;
  reason?: string;
}

/**
 * Classifica o payload antes de qualquer resolução de tenant/lead.
 * `notifyOwnMessages` é o flag tenant-scoped orbit_zapi_config.notificar_enviadas_por_mim.
 */
export function classifyZapiInbound(
  payload: ZapiPayload,
  eventType: string,
  opts: { notifyOwnMessages: boolean },
): ZapiInboundClassification {
  if (eventType !== "on-receive") {
    return { kind: "status_callback", reason: `status_callback:${eventType}` };
  }
  if (payload.isGroup === true) return { kind: "ignore", reason: "group" };
  if (payload.broadcast === true) return { kind: "ignore", reason: "broadcast" };
  if (payload.isNewsletter === true) return { kind: "ignore", reason: "newsletter" };
  if (payload.isStatusReply === true) return { kind: "ignore", reason: "status_reply" };
  if (payload.type && payload.type !== "ReceivedCallback") {
    return { kind: "status_callback", reason: `status_callback:${payload.type}` };
  }

  if (payload.fromMe === true) {
    if ((payload as Record<string, unknown>).fromApi === true) {
      return { kind: "orbit_echo", reason: "orbit_originated" };
    }
    if (!opts.notifyOwnMessages) {
      return { kind: "ignore", reason: "own_messages_disabled" };
    }
    return { kind: "external_out" };
  }

  return { kind: "inbound" };
}

/** Payload sanitizado para observabilidade de LID não resolvido (sem PII aberto). */
export function sanitizeUnresolvedLidPayload(payload: ZapiPayload): Record<string, unknown> {
  const p = payload as Record<string, unknown>;
  const lid = extractLid(payload);
  return {
    lid_hint: lid ? `${lid.slice(0, 4)}***${LID_SUFFIX}` : null,
    instance_id: typeof p.instanceId === "string" ? `${String(p.instanceId).slice(0, 4)}***` : null,
    from_me: payload.fromMe === true,
    from_api: p.fromApi === true,
    type: payload.type ?? null,
    has_text: !!(payload.text?.message || payload.body),
    media: payload.image ? "image" : payload.audio ? "audio" : payload.video ? "video" : payload.document ? "document" : null,
    momment: payload.momment ?? null,
  };
}
