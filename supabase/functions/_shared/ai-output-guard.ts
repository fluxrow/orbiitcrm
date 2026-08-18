// Guard GLOBAL contra vazamento de payload interno do classificador/LLM ao lead.
//
// Incidente de produção (18/08/2026): o modelo devolveu um JSON em code fence com
// "mensagem": "" e o parser fazia `parsed.mensagem || content`, ou seja, caía no
// RAW OUTPUT do modelo e enviou o metadado interno pelo WhatsApp.
//
// Este módulo é a única fonte de verdade para:
//   1) extrair a mensagem pública ("mensagem") de JSON puro OU dentro de fence;
//   2) NUNCA usar raw output como fallback quando ele parece metadado interno;
//   3) bloquear texto estruturado suspeito na última barreira (outbox/sender).
//
// Não altera fluxos comerciais, ofertas ou regras de agendamento.

/** Chaves internas que jamais podem aparecer no texto enviado ao lead. */
export const INTERNAL_PAYLOAD_KEYS = [
  "intencao",
  "dados_extraidos",
  "dados_adicionais",
  "campo_solicitado",
  "cadastro_completo",
  "iniciar_coleta_orcamento",
  "agendamento",
  "classification",
] as const;

/** Intenções que legitimamente não exigem resposta ao lead. */
const NO_REPLY_INTENTS = new Set(["agradecimento", "encerramento", "encerrar", "none", "nenhuma"]);

const FENCE_RE = /^\s*`{3,}\s*(?:json|javascript|js)?\s*([\s\S]*?)\s*`{3,}\s*$/i;
const BARE_JSON_PREFIX_RE = /^\s*json\b\s*(?=[\{\[])/i;

function stripWrappers(raw: string): string {
  let text = String(raw ?? "").trim();
  const fenced = text.match(FENCE_RE);
  if (fenced) text = fenced[1].trim();
  // Prefixo "json" solto (sem cerca), como aparece em alguns clientes.
  text = text.replace(BARE_JSON_PREFIX_RE, "").trim();
  return text;
}

function hasInternalKeys(text: string): boolean {
  return INTERNAL_PAYLOAD_KEYS.some((k) =>
    new RegExp(`["']${k}["']\\s*:`, "i").test(text) || new RegExp(`(^|[\\s{,])${k}\\s*:`, "i").test(text)
  );
}

/**
 * Assinatura de metadado interno / saída estruturada do modelo.
 * Usado como ÚLTIMA barreira antes de qualquer envio de texto.
 */
export function looksLikeInternalPayload(input: unknown): boolean {
  const raw = typeof input === "string" ? input : "";
  if (!raw.trim()) return false;
  const hasFence = /`{3,}\s*json/i.test(raw);
  const stripped = stripWrappers(raw);
  const looksJson = /^[\{\[][\s\S]*[\}\]]$/.test(stripped);
  if ((hasFence || BARE_JSON_PREFIX_RE.test(raw)) && (looksJson || hasInternalKeys(stripped))) return true;
  if (looksJson && hasInternalKeys(stripped)) return true;
  // Fragmento não fechado, mas com chaves internas em formato de objeto.
  if (/[\{\[]/.test(stripped) && hasInternalKeys(stripped)) return true;
  return false;
}

export interface PublicMessageResult {
  /** Texto seguro para enviar ao lead ("" quando não há nada a enviar). */
  text: string;
  /** Objeto interno parseado, quando existiu. */
  parsed: Record<string, unknown> | null;
  /** true quando o conteúdo é estruturado/suspeito e NÃO pode ser enviado. */
  blocked: boolean;
  /** true quando não há mensagem pública e nada deve ser enfileirado. */
  skip: boolean;
  reason:
    | "plain_text"
    | "json_message"
    | "empty_message_no_reply_intent"
    | "empty_message"
    | "unparseable_structured_output";
  intencao: string | null;
}

/**
 * Extrai a mensagem pública da saída do modelo.
 * Regras: só o campo "mensagem" (string não vazia) vai ao lead; raw output
 * estruturado nunca é usado como fallback.
 */
export function extractPublicMessage(raw: unknown): PublicMessageResult {
  const original = typeof raw === "string" ? raw : "";
  const structured = looksLikeInternalPayload(original);
  const candidate = stripWrappers(original);

  let parsed: Record<string, unknown> | null = null;
  if (/^[\{\[]/.test(candidate)) {
    const attempts = [candidate];
    const match = candidate.match(/\{[\s\S]*\}/);
    if (match && match[0] !== candidate) attempts.push(match[0]);
    for (const attempt of attempts) {
      try {
        const value = JSON.parse(attempt);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          parsed = value as Record<string, unknown>;
          break;
        }
      } catch { /* tenta o próximo recorte */ }
    }
  }

  if (parsed) {
    const intencao = typeof parsed.intencao === "string" ? parsed.intencao.trim().toLowerCase() : null;
    const mensagem = typeof parsed.mensagem === "string" ? parsed.mensagem.trim() : "";
    if (mensagem) {
      return { text: mensagem, parsed, blocked: false, skip: false, reason: "json_message", intencao };
    }
    return {
      text: "",
      parsed,
      blocked: false,
      skip: true,
      reason: intencao && NO_REPLY_INTENTS.has(intencao) ? "empty_message_no_reply_intent" : "empty_message",
      intencao,
    };
  }

  if (structured) {
    // Estruturado e não parseável com segurança: bloqueia, sem enviar o JSON.
    return {
      text: "",
      parsed: null,
      blocked: true,
      skip: true,
      reason: "unparseable_structured_output",
      intencao: null,
    };
  }

  return {
    text: original.trim(),
    parsed: null,
    blocked: false,
    skip: !original.trim(),
    reason: "plain_text",
    intencao: null,
  };
}

/** Resumo sanitizado (sem PII/conteúdo) para log de incidente. */
export function sanitizedLeakSummary(raw: unknown) {
  const text = typeof raw === "string" ? raw : "";
  return {
    length: text.length,
    has_fence: /`{3,}\s*json/i.test(text),
    bare_json_prefix: BARE_JSON_PREFIX_RE.test(text),
    internal_keys: INTERNAL_PAYLOAD_KEYS.filter((k) => new RegExp(`["']${k}["']\\s*:`, "i").test(text)),
  };
}
