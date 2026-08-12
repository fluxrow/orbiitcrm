/**
 * Trava determinística contra coleta de e-mail pelo agente comercial.
 *
 * Tenant-scoped: só é aplicada quando `orbit_ai_config.block_email_collection = true`.
 * Nunca altera notificações internas nem mensagens históricas — atua apenas no
 * texto da resposta do agente, antes de persistir/enfileirar.
 */

const EMAIL_WORD = "(?:e-?mails?|enderec?os? eletronicos?|endereços? eletrônicos?)";

/** Frases em que o agente SOLICITA e-mail (pergunta ou comando). */
const REQUEST_PATTERNS: RegExp[] = [
  // "qual seu melhor e-mail", "qual e o seu email"
  new RegExp(`\\bqual\\b[^.?!]{0,40}\\b${EMAIL_WORD}\\b`, "i"),
  // "me passa/manda/informa/envia seu email"
  new RegExp(`\\b(?:me\\s+)?(?:passa|passe|manda|mande|envia|envie|informa|informe|compartilha|compartilhe|deixa|deixe)\\b[^.?!]{0,40}\\b${EMAIL_WORD}\\b`, "i"),
  // "vou precisar do email", "preciso do seu email para liberar acesso"
  new RegExp(`\\b(?:preciso|precisarei|vou\\s+precisar|necessito|poderia\\s+(?:me\\s+)?(?:passar|informar|enviar)|pode\\s+(?:me\\s+)?(?:passar|informar|enviar)|consegue\\s+(?:me\\s+)?(?:passar|informar|enviar))\\b[^.?!]{0,40}\\b${EMAIL_WORD}\\b`, "i"),
  // "cadastro seu email", "confirma seu email", "qual endereço para cadastro"
  new RegExp(`\\b(?:confirma|confirme|cadastra|cadastre)\\b[^.?!]{0,40}\\b${EMAIL_WORD}\\b`, "i"),
  // "seu melhor e-mail?" / "seu e-mail, por favor"
  new RegExp(`\\b(?:seu|teu)\\b[^.?!]{0,20}\\b${EMAIL_WORD}\\b[^.?!]{0,20}(?:\\?|,?\\s*por\\s+favor)`, "i"),
];

/** Contextos informativos que NÃO configuram coleta. */
const SAFE_PATTERNS: RegExp[] = [
  new RegExp(`\\bnao\\s+(?:envio|enviamos|uso|usamos|preciso|precisamos|trabalho|trabalhamos)\\b[^.?!]{0,40}\\b${EMAIL_WORD}\\b`, "i"),
  new RegExp(`\\bnão\\s+(?:envio|enviamos|uso|usamos|preciso|precisamos|trabalho|trabalhamos)\\b[^.?!]{0,40}\\b${EMAIL_WORD}\\b`, "i"),
  new RegExp(`\\bsem\\s+(?:precisar\\s+de\\s+)?${EMAIL_WORD}\\b`, "i"),
  new RegExp(`\\b${EMAIL_WORD}\\b[^.?!]{0,30}\\bnao\\s+(?:e|é)\\s+necess`, "i"),
  new RegExp(`\\b${EMAIL_WORD}\\b[^.?!]{0,30}\\bnão\\s+(?:e|é)\\s+necess`, "i"),
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isRequestSentence(sentence: string): boolean {
  if (SAFE_PATTERNS.some((re) => re.test(sentence))) return false;
  return REQUEST_PATTERNS.some((re) => re.test(sentence));
}

export interface EmailGuardVerdict {
  violates: boolean;
  sentences: string[];
}

/** Detecta se o texto contém pedido de e-mail feito pelo agente. */
export function detectEmailCollection(text: string | null | undefined): EmailGuardVerdict {
  const raw = String(text ?? "");
  if (!raw.trim()) return { violates: false, sentences: [] };
  const offending = splitSentences(raw).filter(isRequestSentence);
  return { violates: offending.length > 0, sentences: offending };
}

/** Remove SOMENTE as sentenças de coleta de e-mail, preservando o resto. */
export function sanitizeEmailCollection(text: string | null | undefined): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  const kept = splitSentences(raw).filter((s) => !isRequestSentence(s));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** Fallback curto e neutro: mantém a conversa no WhatsApp, sem inventar estágio comercial. */
export const EMAIL_GUARD_FALLBACK =
  "Seguimos por aqui mesmo no WhatsApp. Me conta o que você quer entender melhor?";

/** Instrução corretiva para uma única regeneração. */
export const EMAIL_GUARD_CORRECTIVE =
  "VIOLAÇÃO: você pediu e-mail ao lead. É proibido solicitar e-mail, melhor e-mail ou endereço eletrônico " +
  "para cadastro, acesso, detalhes, inscrição, pagamento ou continuidade. Todo o atendimento e a venda seguem " +
  "no WhatsApp, e os dados já existentes bastam. Reescreva a mensagem final sem nenhum pedido de e-mail, " +
  "mantendo o mesmo objetivo, em 1 a 3 frases curtas e no máximo uma pergunta curta.";

/**
 * Aplica a trava: sanitiza e devolve fallback quando o texto ficar vazio.
 * `applyGuard=false` (tenant sem a trava) devolve o texto original intacto.
 */
export function enforceNoEmailCollection(
  text: string,
  applyGuard: boolean,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  if (!applyGuard) return { text, changed: false, fallbackUsed: false };
  const verdict = detectEmailCollection(text);
  if (!verdict.violates) return { text, changed: false, fallbackUsed: false };
  const sanitized = sanitizeEmailCollection(text);
  if (!sanitized) return { text: EMAIL_GUARD_FALLBACK, changed: true, fallbackUsed: true };
  return { text: sanitized, changed: true, fallbackUsed: false };
}
