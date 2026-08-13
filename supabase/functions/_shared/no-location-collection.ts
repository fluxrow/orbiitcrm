/**
 * Trava determinística contra coleta de LOCALIZAÇÃO (cidade/estado/UF/região/endereço)
 * e contra o enquadramento burocrático de "finalizar cadastro".
 *
 * Tenant-scoped: só é aplicada quando `orbit_ai_config.block_location_collection = true`.
 * Nunca altera notificações internas, dados já existentes nem mensagens históricas —
 * atua apenas no texto da resposta do agente, antes de persistir/enfileirar.
 *
 * Motivação (Bullink): cidade/estado não fazem parte da qualificação nem do processo
 * comercial (produto 100% online, preço/pagamento/entrega independem de localização).
 */

const LOCATION_WORD =
  "(?:cidades?|estados?|\\buf\\b|localizac?[ãa]o|localidades?|regi[ãa]o|regiao|endere[çc]os?|cep)";

/** Frases em que o agente SOLICITA localização. */
const REQUEST_PATTERNS: RegExp[] = [
  // "qual sua cidade", "qual é o estado", "qual cidade você mora"
  new RegExp(`\\bqual\\b[^.?!]{0,40}\\b${LOCATION_WORD}\\b`, "i"),
  // "me passa/informa/diz sua cidade"
  new RegExp(
    `\\b(?:me\\s+)?(?:passa|passe|manda|mande|informa|informe|diz|diga|fala|fale|confirma|confirme|compartilha|compartilhe)\\b[^.?!]{0,40}\\b${LOCATION_WORD}\\b`,
    "i",
  ),
  // "preciso da sua cidade", "vou precisar do estado"
  new RegExp(
    `\\b(?:preciso|precisarei|vou\\s+precisar|necessito|poderia\\s+(?:me\\s+)?(?:passar|informar|dizer)|pode\\s+(?:me\\s+)?(?:passar|informar|dizer)|consegue\\s+(?:me\\s+)?(?:passar|informar|dizer))\\b[^.?!]{0,40}\\b${LOCATION_WORD}\\b`,
    "i",
  ),
  // "sua cidade?" / "cidade e estado, por favor"
  new RegExp(`\\b${LOCATION_WORD}\\b[^.?!]{0,25}(?:\\?|,?\\s*por\\s+favor)`, "i"),
  // "de onde você é/fala/mora", "onde você mora/está/fica/vive"
  /\bde\s+onde\s+(?:voc[êe]|tu|vc)\b[^.?!]{0,25}(?:[ée]|fala|mora|vem|atua)/i,
  /\bonde\s+(?:voc[êe]|tu|vc)\b[^.?!]{0,20}\b(?:mora|vive|est[áa]|fica|reside|atua)\b/i,
  // "em que cidade você mora"
  new RegExp(`\\bem\\s+(?:que|qual)\\b[^.?!]{0,15}\\b${LOCATION_WORD}\\b`, "i"),
  // "você mora em qual cidade"
  new RegExp(`\\b(?:mora|vive|reside|est[áa]|fica)\\b[^.?!]{0,20}\\bqual\\b[^.?!]{0,15}\\b${LOCATION_WORD}\\b`, "i"),
];

/** Enquadramento cadastral proibido (mesmo sem pedir localização). */
const REGISTRATION_PATTERNS: RegExp[] = [
  /\bfinaliza(?:r|ndo)?\b[^.?!]{0,25}\bcadastro\b/i,
  /\bcompletar?\b[^.?!]{0,25}\bcadastro\b/i,
  /\bconcluir\b[^.?!]{0,25}\bcadastro\b/i,
  /\bpara\s+o?\s*cadastro\b/i,
  /\bfazer\s+(?:o\s+)?seu\s+cadastro\b/i,
];

/** Contextos informativos que NÃO configuram coleta. */
const SAFE_PATTERNS: RegExp[] = [
  new RegExp(`\\bn[ãa]o\\s+(?:preciso|precisamos|importa|interessa|faz\\s+diferen[çc]a)\\b[^.?!]{0,40}\\b${LOCATION_WORD}\\b`, "i"),
  new RegExp(`\\b${LOCATION_WORD}\\b[^.?!]{0,30}\\bn[ãa]o\\s+(?:e|é|faz)\\b`, "i"),
  new RegExp(`\\bindepende\\b[^.?!]{0,30}\\b${LOCATION_WORD}\\b`, "i"),
  new RegExp(`\\bde\\s+qualquer\\s+${LOCATION_WORD}\\b`, "i"),
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isOffendingSentence(sentence: string): boolean {
  if (SAFE_PATTERNS.some((re) => re.test(sentence))) return false;
  return REQUEST_PATTERNS.some((re) => re.test(sentence)) ||
    REGISTRATION_PATTERNS.some((re) => re.test(sentence));
}

export interface LocationGuardVerdict {
  violates: boolean;
  sentences: string[];
}

/** Detecta pedido de localização ou enquadramento de "cadastro" na fala do agente. */
export function detectLocationCollection(text: string | null | undefined): LocationGuardVerdict {
  const raw = String(text ?? "");
  if (!raw.trim()) return { violates: false, sentences: [] };
  const offending = splitSentences(raw).filter(isOffendingSentence);
  return { violates: offending.length > 0, sentences: offending };
}

/** Remove SOMENTE as sentenças ofensivas, preservando o resto. */
export function sanitizeLocationCollection(text: string | null | undefined): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  const kept = splitSentences(raw).filter((s) => !isOffendingSentence(s));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** Fallback curto e neutro: mantém a conversa viva sem inventar estágio comercial. */
export const LOCATION_GUARD_FALLBACK =
  "Perfeito. Me conta o que você quer entender melhor pra eu te ajudar direito?";

/** Instrução corretiva para uma única regeneração. */
export const LOCATION_GUARD_CORRECTIVE =
  "VIOLAÇÃO: você pediu localização (cidade, estado, UF, região, endereço) ou enquadrou a conversa como " +
  "'finalizar cadastro'. É proibido pedir esses dados: eles não influenciam produto, preço, pagamento, " +
  "entrega, agendamento ou atendimento. Reescreva a mensagem final sem nenhum pedido de localização e sem " +
  "falar de cadastro, mantendo o mesmo objetivo comercial, em 1 a 3 frases curtas e no máximo uma pergunta.";

/**
 * Aplica a trava: sanitiza e devolve fallback quando o texto ficar vazio.
 * `applyGuard=false` (tenant sem a trava) devolve o texto original intacto.
 */
export function enforceNoLocationCollection(
  text: string,
  applyGuard: boolean,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  if (!applyGuard) return { text, changed: false, fallbackUsed: false };
  const verdict = detectLocationCollection(text);
  if (!verdict.violates) return { text, changed: false, fallbackUsed: false };
  const sanitized = sanitizeLocationCollection(text);
  if (!sanitized) return { text: LOCATION_GUARD_FALLBACK, changed: true, fallbackUsed: true };
  return { text: sanitized, changed: true, fallbackUsed: false };
}
