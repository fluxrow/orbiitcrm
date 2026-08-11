// Helpers puros do pipeline inbound de WhatsApp (Z-API).
//
// Regras invioláveis (não relaxar sem revisão de segurança):
//  • empresa é resolvida EXCLUSIVAMENTE por instance_id. Sem fallback por
//    "primeiro tenant ativo" — isso já causou vazamento cross-tenant real
//    (mesmo instance_id em dois tenants ⇒ inbound gravado no tenant errado).
//  • chatLid (`...@lid`) NUNCA é telefone. Só `phone`/`from` numéricos valem.
//  • fromMe / grupo / broadcast / newsletter / status reply nunca viram IN.

export const MAX_PREVIEW_CHARS = 120;

export interface ZapiPayload {
  instanceId?: string | null;
  phone?: string | null;
  from?: string | null;
  chatLid?: string | null;
  fromMe?: boolean | null;
  isGroup?: boolean | null;
  broadcast?: boolean | null;
  isNewsletter?: boolean | null;
  isStatusReply?: boolean | null;
  type?: string | null;
  momment?: number | null;
  messageId?: string | null;
  id?: string | null;
  text?: { message?: string | null } | null;
  body?: string | null;
  caption?: string | null;
  image?: Record<string, string | null> | null;
  audio?: Record<string, string | null> | null;
  video?: Record<string, string | null> | null;
  document?: Record<string, string | null> | null;
  sticker?: Record<string, string | null> | null;
  [key: string]: unknown;
}

/** Somente dígitos; `@lid` e ids longos do WhatsApp são descartados. */
export function extractInboundPhone(payload: ZapiPayload): string | null {
  const candidates = [payload.phone, payload.from];
  for (const raw of candidates) {
    if (!raw) continue;
    const value = String(raw);
    if (value.includes("@lid") || value.includes("@g.us") || value.includes("@newsletter")) continue;
    const digits = value.replace(/\D/g, "");
    // Números reais têm 10–15 dígitos (E.164). chatLid tem 15+ e não é telefone,
    // por isso só aceitamos quando veio de `phone`/`from` sem sufixo @lid.
    if (digits.length < 10 || digits.length > 15) continue;
    return digits.startsWith("55") ? digits : `55${digits}`;
  }
  return null;
}

export interface InboundEligibility {
  process: boolean;
  reason?: string;
}

/** Decide se o payload representa uma mensagem inbound processável. */
export function inboundEligibility(payload: ZapiPayload, eventType: string): InboundEligibility {
  if (eventType !== "on-receive") return { process: false, reason: `event_not_inbound:${eventType}` };
  if (payload.fromMe === true) return { process: false, reason: "from_me" };
  if (payload.isGroup === true) return { process: false, reason: "group" };
  if (payload.broadcast === true) return { process: false, reason: "broadcast" };
  if (payload.isNewsletter === true) return { process: false, reason: "newsletter" };
  if (payload.isStatusReply === true) return { process: false, reason: "status_reply" };
  if (payload.type && payload.type !== "ReceivedCallback") {
    return { process: false, reason: `status_callback:${payload.type}` };
  }
  if (!extractInboundPhone(payload)) return { process: false, reason: "no_phone" };
  const { messageText, tipoMidia } = extractInboundContent(payload);
  if (!messageText && !tipoMidia) return { process: false, reason: "empty_payload" };
  return { process: true };
}

export interface InboundContent {
  messageText: string;
  tipoMidia: string | null;
  urlMidia: string | null;
}

export function extractInboundContent(payload: ZapiPayload): InboundContent {
  let tipoMidia: string | null = null;
  let urlMidia: string | null = null;
  let messageText = payload.text?.message || payload.body || "";

  if (payload.image) {
    tipoMidia = "image";
    urlMidia = payload.image.imageUrl || payload.image.url || null;
    messageText = payload.image.caption || messageText || "";
  } else if (payload.audio) {
    tipoMidia = "audio";
    urlMidia = payload.audio.audioUrl || payload.audio.url || null;
  } else if (payload.video) {
    tipoMidia = "video";
    urlMidia = payload.video.videoUrl || payload.video.url || null;
    messageText = payload.video.caption || messageText || "";
  } else if (payload.document) {
    tipoMidia = "document";
    urlMidia = payload.document.documentUrl || payload.document.url || null;
    messageText = payload.document.caption || payload.document.fileName || messageText || "";
  } else if (payload.sticker) {
    tipoMidia = "image";
    urlMidia = payload.sticker.stickerUrl || payload.sticker.url || null;
  }

  if (!messageText && payload.caption) messageText = String(payload.caption);
  return { messageText: String(messageText || "").trim(), tipoMidia, urlMidia };
}

export function providerMessageId(payload: ZapiPayload): string | null {
  const value = payload.messageId || payload.id;
  return value ? String(value) : null;
}

/** Timestamp real do inbound (Z-API manda `momment` em ms). */
export function inboundTimestampIso(payload: ZapiPayload, now: Date = new Date()): string {
  const raw = Number(payload.momment ?? 0);
  if (Number.isFinite(raw) && raw > 1_000_000_000_000 && raw < now.getTime() + 86_400_000) {
    return new Date(raw).toISOString();
  }
  return now.toISOString();
}

/** Preview curto e sem PII estruturada/quebra de layout. */
export function safePreview(text: string, tipoMidia: string | null): string {
  const base = (text || (tipoMidia ? `📎 ${tipoMidia}` : "")).replace(/\s+/g, " ").trim();
  return base.slice(0, MAX_PREVIEW_CHARS);
}

/**
 * Resolve empresa a partir das linhas de orbit_zapi_config casadas pelo
 * instance_id. Ambíguo (2+ tenants) é ERRO, nunca "escolhe um".
 */
export function resolveEmpresaByInstance(
  rows: Array<{ empresa_id: string | null }> | null | undefined,
): { empresaId: string | null; reason?: string } {
  const ids = Array.from(new Set((rows ?? []).map((r) => r.empresa_id).filter(Boolean))) as string[];
  if (ids.length === 1) return { empresaId: ids[0] };
  if (ids.length === 0) return { empresaId: null, reason: "instance_not_mapped" };
  return { empresaId: null, reason: "instance_ambiguous" };
}

// ─────────────────────────────────────────────────────────────
// Backfill: consolidação de eventos históricos
// ─────────────────────────────────────────────────────────────

export interface BackfillEvent {
  log_id: string;
  payload: ZapiPayload;
  created_at: string;
}

export interface BackfillCandidate {
  log_id: string;
  provider_message_id: string;
  phone: string;
  timestamp: string;
  content: InboundContent;
  payload: ZapiPayload;
}

/**
 * Filtra e ordena cronologicamente os eventos elegíveis, deduplicando por
 * provider_message_id (o primeiro log vence).
 */
export function selectBackfillCandidates(events: BackfillEvent[]): {
  candidates: BackfillCandidate[];
  skipped: Record<string, number>;
} {
  const skipped: Record<string, number> = {};
  const seen = new Set<string>();
  const candidates: BackfillCandidate[] = [];

  for (const event of events) {
    const eligibility = inboundEligibility(event.payload, "on-receive");
    if (!eligibility.process) {
      const key = (eligibility.reason || "unknown").split(":")[0];
      skipped[key] = (skipped[key] ?? 0) + 1;
      continue;
    }
    const pid = providerMessageId(event.payload);
    if (!pid) {
      skipped.no_message_id = (skipped.no_message_id ?? 0) + 1;
      continue;
    }
    if (seen.has(pid)) {
      skipped.duplicate_in_logs = (skipped.duplicate_in_logs ?? 0) + 1;
      continue;
    }
    seen.add(pid);
    candidates.push({
      log_id: event.log_id,
      provider_message_id: pid,
      phone: extractInboundPhone(event.payload)!,
      timestamp: inboundTimestampIso(event.payload, new Date(event.created_at)),
      content: extractInboundContent(event.payload),
      payload: event.payload,
    });
  }

  candidates.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { candidates, skipped };
}

export interface AgentReplyTarget {
  conversa_id: string;
  prospect_id: string;
  provider_message_id: string;
  mensagem: string;
  telefone: string;
  timestamp: string;
}

/**
 * No máximo UMA resposta por conversa, referente ao inbound mais recente.
 * Conversas sem prospect vinculado nunca geram resposta automática.
 */
export function consolidateAgentReplies(
  items: Array<AgentReplyTarget & { prospect_id: string | null }>,
): AgentReplyTarget[] {
  const byConversa = new Map<string, AgentReplyTarget>();
  for (const item of items) {
    if (!item.prospect_id) continue;
    const current = byConversa.get(item.conversa_id);
    if (!current || item.timestamp > current.timestamp) {
      byConversa.set(item.conversa_id, item as AgentReplyTarget);
    }
  }
  return Array.from(byConversa.values());
}
