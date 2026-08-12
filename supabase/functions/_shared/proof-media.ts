// Prova social — helpers puros compartilhados entre o agente e os testes.
// Regras de segurança:
//  - só dispara em intenção CLARA de prova (pedido explícito, aceite curto de
//    uma oferta anterior do agente, ou decisão estruturada do agente);
//  - o payload de vídeo/imagem NUNCA carrega fileName/filename/nome local;
//  - a mensagem visível ao lead é apenas a legenda aprovada (sem storage_path);
//  - nunca promete mídia sem mídia enfileirada (ver stripUnfulfilledMediaPromise).

export const PROOF_REQUEST_RE =
  /\b(prova|provas|comprova\w*|depoiment\w*|testemunh\w*|result\w*|case|cases|print|prints|alu[no]{2,}s?\s+(que|com)|funciona\s+mesmo)\b/i;

/** Aceite curto do lead ("sim", "quero ver", "manda aí", "claro"...). */
export const AFFIRMATIVE_RE =
  /^(s|sim|ss|isso|claro|bora|quero|quero\s+ver|pode|pode\s+ser|pode\s+mandar|manda|manda\s+a[ií]|mostra|mostre|show|com\s+certeza|por\s+favor|opa|aham|uhum|ok|okay|blz|beleza|vamos|vamo|top|legal|gostaria|adoraria|sim\s+quero|claro\s+que\s+sim|isso\s+mesmo|positivo|afirmativo|👍|👌|✅)[\s!.,]*$/i;

/** Oferta do agente na última mensagem OUT ("quer ver o resultado de um aluno?"). */
export const PROOF_OFFER_RE =
  /\b(prova|provas|depoiment\w*|testemunh\w*|result\w*|case|cases|print|prints|v[ií]deo|videozinho|alu[no]{2,}s?)\b/i;

const OFFER_VERB_RE =
  /\b(quer|queres|posso|gostaria|te\s+mando|te\s+envio|mandar|enviar|mostrar|te\s+mostro|ver|d[aá]\s+uma\s+olhada)\b/i;

export function isProofRequest(texto: string | null | undefined): boolean {
  const t = (texto || "").toLowerCase();
  if (!t.trim()) return false;
  return PROOF_REQUEST_RE.test(t);
}

/** Aceite curto: no máximo poucas palavras e sem conteúdo novo. */
export function isShortAffirmative(texto: string | null | undefined): boolean {
  const t = (texto || "").trim();
  if (!t || t.length > 40) return false;
  return AFFIRMATIVE_RE.test(t);
}

/** A última mensagem OUT do agente ofereceu mostrar prova/resultado/depoimento? */
export function agentOfferedProof(lastAgentOut: string | null | undefined): boolean {
  const t = (lastAgentOut || "").trim();
  if (!t) return false;
  return PROOF_OFFER_RE.test(t) && OFFER_VERB_RE.test(t);
}

export type ProofIntentReason =
  | "explicit_request"
  | "affirmative_after_offer"
  | "agent_decision"
  | "no_intent";

/**
 * Detecção contextual de media intent `prova_social`. Genérica e pura:
 * qualquer tenant se beneficia, nenhum efeito colateral.
 */
export function detectProofIntent(input: {
  mensagem_lead?: string | null;
  last_agent_out?: string | null;
  agent_decision?: boolean | null;
}): { intent: boolean; reason: ProofIntentReason } {
  if (input.agent_decision === true) return { intent: true, reason: "agent_decision" };
  if (isProofRequest(input.mensagem_lead)) return { intent: true, reason: "explicit_request" };
  if (isShortAffirmative(input.mensagem_lead) && agentOfferedProof(input.last_agent_out)) {
    return { intent: true, reason: "affirmative_after_offer" };
  }
  return { intent: false, reason: "no_intent" };
}

/** Lê a decisão estruturada do agente (tolerante a variações de campo). */
export function readAgentProofDecision(parsed: unknown): boolean {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const flags = [p.enviar_prova_social, p.enviar_prova, p.send_proof, p.prova_social];
  if (flags.some((f) => f === true)) return true;
  const intents = [p.media_intent, p.midia_intencao, p.acao, p.action];
  return intents.some((v) => typeof v === "string" && /prova_social|enviar_prova/i.test(v));
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
    const dur = Number(m.duracao_segundos ?? NaN);
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
