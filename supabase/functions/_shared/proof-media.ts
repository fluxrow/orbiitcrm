// Prova social — helpers puros compartilhados entre o agente e os testes.
// Regras de segurança:
//  - só dispara em intenção CLARA de prova (pedido explícito, aceite curto de
//    uma oferta anterior do agente, ou decisão estruturada do agente);
//  - o payload de vídeo/imagem NUNCA carrega fileName/filename/nome local;
//  - a mensagem visível ao lead é apenas a legenda aprovada (sem storage_path);
//  - nunca promete mídia sem mídia enfileirada (ver stripUnfulfilledMediaPromise).

export const PROOF_REQUEST_RE =
  /\b(prova|provas|comprova\w*|depoiment\w*|testemunh\w*|case|cases|print|prints)\b|\b(quero|queria|posso|pode|manda|mandar|envia|enviar|mostra|mostrar|tem|ver)\b[^.!?\n]{0,40}\b(v[ií]deo|videozinho|resultado\w*|alu[no]{2,}s?)\b/i;

/**
 * Aceite INEQUÍVOCO do lead. Interjeições ambíguas ("opa", "ok", "blz", "top",
 * "legal", "show", "s", "ss", "aham", "uhum", "beleza") foram removidas: elas
 * aparecem em saudações normais e causaram envio indevido de mídia.
 */
export const AFFIRMATIVE_RE =
  /^(sim|sim\s+quero|quero|quero\s+ver|quero\s+sim|manda|manda\s+a[ií]|manda\s+sim|pode\s+mandar|pode\s+enviar|mostra|mostra\s+a[ií]|mostre|claro|claro\s+que\s+sim|com\s+certeza|por\s+favor|positivo|👍|👌|✅)[\s!.,]*$/i;

/**
 * Oferta EXPLÍCITA de mídia/prova na OUT anterior. Exige substantivo de prova
 * (prova/depoimento/testemunho/case/print/vídeo) + verbo de exibição/envio.
 * "resultado" isolado NUNCA caracteriza oferta.
 */
export const PROOF_OFFER_RE =
  /\b(prova|provas|depoiment\w*|testemunh\w*|case|cases|print|prints|v[ií]deo|videozinho)\b/i;

const OFFER_VERB_RE =
  /\b(mostr(ar|o|e|a)|mand(ar|o|a|e)|envi(ar|o|a|e)|ver|d[aá]\s+uma\s+olhada)\b/i;

/** Pergunta de descoberta ("qual resultado você quer alcançar?") nunca é oferta. */
const DISCOVERY_QUESTION_RE =
  /\b(qual|quais|quanto|como|onde|quando|que)\b[^.!?\n]{0,60}\b(resultado\w*|objetivo\w*|meta\w*|desafio\w*|faturament\w*)\b/i;

/** Status de OUT realmente entregue ao lead (schema real do orbit_mensagens). */
export const DELIVERED_OUT_STATUS = [
  "enviada",
  "sent",
  "entregue",
  "delivered",
  "lida",
  "read",
];

const NOT_DELIVERED_OUT_STATUS = [
  "simulated",
  "queued",
  "pending",
  "processing",
  "canceled",
  "cancelled",
  "cancelada",
  "failed",
  "falhou",
  "erro",
  "error",
];

export function isDeliveredOutStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (NOT_DELIVERED_OUT_STATUS.includes(s)) return false;
  return DELIVERED_OUT_STATUS.includes(s);
}

export function isProofRequest(texto: string | null | undefined): boolean {
  const t = (texto || "").toLowerCase();
  if (!t.trim()) return false;
  return PROOF_REQUEST_RE.test(t);
}

/** Aceite curto inequívoco: frase completa de aceite, sem conteúdo novo. */
export function isShortAffirmative(texto: string | null | undefined): boolean {
  const t = (texto || "").trim();
  if (!t || t.length > 40) return false;
  return AFFIRMATIVE_RE.test(t);
}

/** OUT anterior (imediatamente anterior, mesma empresa+conversa). */
export type PreviousOut = {
  mensagem?: string | null;
  status?: string | null;
  /** Metadata estruturada preferencial. Regex é só compatibilidade. */
  offered_proof_social?: boolean | null;
};

/** A OUT anterior ofereceu explicitamente mostrar/mandar prova/vídeo/depoimento? */
export function agentOfferedProof(previous: PreviousOut | string | null | undefined): boolean {
  const prev: PreviousOut = typeof previous === "string" ? { mensagem: previous } : (previous ?? {});
  if (prev.offered_proof_social === true) return true;
  const t = (prev.mensagem || "").trim();
  if (!t) return false;
  if (DISCOVERY_QUESTION_RE.test(t) && !PROOF_OFFER_RE.test(t)) return false;
  return PROOF_OFFER_RE.test(t) && OFFER_VERB_RE.test(t);
}

export type ProofIntentReason =
  | "explicit_request"
  | "affirmative_after_offer"
  | "no_intent"
  | "affirmative_without_offer"
  | "previous_out_not_delivered"
  | "agent_decision_without_evidence";

/**
 * Critério final (fail-closed):
 *   explicit_request
 *   OU (affirmative_unambiguous AND previous_out_delivered AND previous_out_offered_proof)
 * `agent_decision` apenas CONFIRMA — nunca dispara sozinho.
 */
export function detectProofIntent(input: {
  mensagem_lead?: string | null;
  previous_out?: PreviousOut | null;
  agent_decision?: boolean | null;
}): { intent: boolean; reason: ProofIntentReason } {
  if (isProofRequest(input.mensagem_lead)) return { intent: true, reason: "explicit_request" };

  if (isShortAffirmative(input.mensagem_lead)) {
    const prev = input.previous_out ?? null;
    if (!prev) return { intent: false, reason: "affirmative_without_offer" };
    if (!isDeliveredOutStatus(prev.status)) {
      return { intent: false, reason: "previous_out_not_delivered" };
    }
    if (!agentOfferedProof(prev)) return { intent: false, reason: "affirmative_without_offer" };
    return { intent: true, reason: "affirmative_after_offer" };
  }

  if (input.agent_decision === true) {
    return { intent: false, reason: "agent_decision_without_evidence" };
  }
  return { intent: false, reason: "no_intent" };
}

/** Lê a decisão estruturada do agente. Parse estreito: só valores exatos. */
export function readAgentProofDecision(parsed: unknown): boolean {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const flags = [p.enviar_prova_social, p.enviar_prova, p.send_proof];
  if (flags.some((f) => f === true)) return true;
  const intents = [p.media_intent, p.midia_intencao];
  return intents.some((v) => typeof v === "string" && v.trim().toLowerCase() === "prova_social");
}


export function matchesTriggerKeywords(
  texto: string | null | undefined,
  keywords: unknown,
): boolean {
  const list = Array.isArray(keywords) ? keywords : [];
  if (list.length === 0) return true;
  const lower = (texto || "").toLowerCase();
  return list.some((k) => lower.includes(String(k).toLowerCase()));
}

export type ProofMedia = {
  id: string;
  kind: string;
  caption?: string | null;
  storage_path: string;
  duracao_segundos?: number | null;
  duration_seconds?: number | null;
  uso_count?: number | null;
};

export function proofPayloadType(kind: string): "video" | "image" {
  return kind === "video" ? "video" : "image";
}

/**
 * Seleção determinística: vídeo curto preferencial (mais próximo de 25s),
 * fallback para imagem. A lista já deve vir filtrada por empresa_id/aprovado/ativo.
 */
export const PREFERRED_VIDEO_SECONDS = 25;

export function selectProofMedia<T extends ProofMedia>(list: T[] | null | undefined): T | null {
  const items = (list ?? []).filter((m) => m && m.storage_path);
  if (items.length === 0) return null;
  const score = (m: T) => {
    const isVideo = m.kind === "video";
    const dur = Number(m.duracao_segundos ?? m.duration_seconds ?? NaN);
    const durDelta = Number.isFinite(dur) ? Math.abs(dur - PREFERRED_VIDEO_SECONDS) : 9999;
    return [isVideo ? 0 : 1, isVideo ? durDelta : 0, Number(m.uso_count ?? 0)];
  };
  return [...items].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

/** Payload enfileirado no outbox. Sem fileName e sem nome local do arquivo. */
export function buildProofOutboxPayload(media: ProofMedia) {
  return {
    mensagem: media.caption ?? "",
    storage_path: media.storage_path,
    media_library_id: media.id,
  };
}

/** Corpo nativo Z-API para vídeo — usado só quando envio real estiver liberado. */
export function buildZapiVideoBody(phone: string, signedUrl: string, caption: string) {
  return { phone, video: signedUrl, caption };
}

/** Escopo de idempotência: um único envio de mídia por inbound + media. */
export function proofIdempotencyScope(inboundId: string, mediaId: string): string {
  return `media:${mediaId}:${inboundId}`;
}

const PROMISE_SENTENCE_RE =
  /\b(vou (te )?(mandar|enviar|mostrar)|te (mando|envio|mostro)|segue|seguem|d[aá] uma olhada|olha (o|esse|este)|manda(ndo)? (o|a) (v[ií]deo|print)|aqui (est[aá]|vai))\b[^.!?\n]*\b(prova|provas|depoiment\w*|result\w*|case|cases|print|prints|v[ií]deo|alu[no]{2,}s?)\b/i;

export const NO_MEDIA_FALLBACK =
  "Consigo te explicar melhor por aqui. O que você mais quer entender agora?";

/**
 * Remove frases que prometem mídia quando nenhuma mídia foi enfileirada,
 * evitando legenda órfã. Se sobrar vazio, devolve o fallback neutro.
 */
export function stripUnfulfilledMediaPromise(texto: string | null | undefined): string {
  const raw = (texto || "").trim();
  if (!raw) return NO_MEDIA_FALLBACK;
  const parts = raw.split(/(?<=[.!?\n])\s+/).filter((s) => s.trim());
  const kept = parts.filter((s) => !PROMISE_SENTENCE_RE.test(s) && !/:\s*$/.test(s.trim()));
  const out = kept.join(" ").trim();
  return out || NO_MEDIA_FALLBACK;
}
