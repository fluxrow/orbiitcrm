/**
 * Trava determinística contra FALSA SEPARAÇÃO DE IDENTIDADE.
 *
 * Problema real (Bullink / caso Ronaldo): o agente fala como Fernando Albuquerque,
 * dono da oferta, mas oferecia "colocar o lead em contato com um especialista".
 * Isso cria um terceiro que não existe, quebra a persona e promete um contato que
 * nunca acontece — a mensagem era apenas texto, sem handoff real registrado.
 *
 * Tenant-scoped: só é aplicada quando `orbit_ai_config.block_identity_split = true`.
 * Com a flag NULL/false o comportamento legado permanece byte-for-byte.
 *
 * A trava NUNCA impede handoff humano legítimo:
 *   - lead pediu explicitamente pessoa/humano/atendente;
 *   - a conversa já foi assumida no Orbit (`human_talk = true`);
 *   - o assunto exige ação humana externa à autonomia do agente (handoff autorizado).
 * Nesses casos a transferência é real e a frase é honesta, então passa.
 * Mesmo autorizada, a trava continua proibindo inventar "outro especialista":
 * o handoff legítimo é para o time/atendimento real, não para um perito fictício.
 */

/** Terceiro fictício: perito/consultor/equipe inventados. */
const THIRD_PARTY_ROLE =
  "(?:especialistas?|consultores?|consultora?|atendentes?|assessores?|assessora?|colegas?|t[ée]cnicos?|analistas?|vendedores?|vendedora?)";

/** Verbos/expressões de transferência da conversa. */
const TRANSFER_VERB =
  "(?:encaminh\\w+|transfer\\w+|direcion\\w+|repass\\w+|passar|passo|passando|acion\\w+|cham\\w+|coloc\\w+|conect\\w+|apresent\\w+)";

/**
 * Cláusulas que criam um terceiro. Cada padrão já embute o contexto de
 * transferência ou de promessa de contato — palavra isolada não decide nada.
 */
const THIRD_PARTY_PATTERNS: RegExp[] = [
  // "vou colocar um especialista", "te coloco em contato com um consultor",
  // "vou encaminhar para a equipe", "vou passar para um atendente"
  new RegExp(`\\b${TRANSFER_VERB}\\b[^.?!]{0,60}\\b(?:um|uma|outro|outra|o|a|os|as|nosso|nossa|meu|minha)\\s+${THIRD_PARTY_ROLE}\\b`, "i"),
  new RegExp(`\\b${TRANSFER_VERB}\\b[^.?!]{0,60}\\b(?:nossa|a|minha|com\\s+a)\\s+equipe\\b`, "i"),
  // "colocar/coloque você em contato com ...", mesmo sem citar o papel
  /\bcoloc\w+\b[^.?!]{0,20}\b(?:voc[êe]|te|lhe|o\s+senhor|a\s+senhora)\b[^.?!]{0,20}\bem\s+contato\b/i,
  /\b(?:te|lhe)\s+coloc\w+\b[^.?!]{0,25}\bem\s+contato\b/i,
  /\bem\s+contato\s+com\s+(?:um|uma|outro|outra|o|a|nosso|nossa)\s+/i,
  // "um especialista entra em contato", "a equipe vai te chamar", "ele entra em contato"
  new RegExp(`\\b(?:um|uma|outro|outra|o|a|nosso|nossa)\\s+${THIRD_PARTY_ROLE}\\b[^.?!]{0,40}\\b(?:entra\\w*|entrar[áa]?|vai\\s+entrar|falar[áa]?|vai\\s+falar|te\\s+chama\\w*|assume\\w*|continua\\w*|segue|seguir[áa]?)\\b`, "i"),
  /\b(?:nossa|a|minha)\s+equipe\b[^.?!]{0,40}\b(?:entra\w*|entrar[áa]?|vai\s+entrar|te\s+chama\w*|vai\s+falar|assume\w*|continua\w*)\b/i,
  /\b(?:ele|ela|eles|elas)\s+(?:entra|entrar[áa]|vai\s+entrar|entram|v[ãa]o\s+entrar)\s+em\s+contato\b/i,
  /\b(?:algu[ée]m|uma\s+pessoa)\s+(?:da\s+\w+\s+)?(?:entra|entrar[áa]|vai\s+entrar|entram)\s+em\s+contato\b/i,
  /\bo\s+respons[áa]vel\b[^.?!]{0,40}\b(?:entra\w*|entrar[áa]?|vai\s+entrar|te\s+chama\w*|assume\w*)\b/i,
  // "vou verificar com a equipe", "vou pedir para a equipe", "vou confirmar com o time"
  /\b(?:vou|vamos|preciso)\b[^.?!]{0,25}\b(?:verificar|conferir|confirmar|checar|pedir|falar|alinhar)\b[^.?!]{0,20}\bcom\s+(?:a\s+equipe|o\s+time|meu\s+time|nossa\s+equipe)\b/i,
  /\b(?:vou|vamos)\s+pedir\s+(?:para|pra)\s+(?:a\s+equipe|o\s+time)\b/i,
];

/** Fernando citado em terceira pessoa — o agente É o Fernando. */
const THIRD_PERSON_SELF_PATTERNS: RegExp[] = [
  /\bfalar\s+com\s+(?:o\s+)?fernando\b/i,
  /\b(?:o\s+)?fernando\s+(?:vai|entra|entrar[áa]|te\s+responde|responde|assume|entra\s+em\s+contato)\b/i,
  new RegExp(`\\b${TRANSFER_VERB}\\b[^.?!]{0,40}\\b(?:para|pra|ao|pro)\\s+(?:o\\s+)?fernando\\b`, "i"),
  /\bem\s+contato\s+com\s+(?:o\s+)?fernando\b/i,
  /\bcom\s+(?:o\s+)?fernando\s+albuquerque\b/i,
];

/**
 * Usos legítimos que NUNCA devem ser bloqueados:
 *  - "IA especialista em algoritmo do YouTube" (entregável real da Mentoria);
 *  - o próprio Fernando se descrevendo como especialista;
 *  - "acompanhamento direto comigo" e variantes de primeira pessoa.
 */
const SAFE_PATTERNS: RegExp[] = [
  /\b(?:ia|i\.a\.|intelig[êe]ncia\s+artificial|rob[ôo]|bot|ferramenta|agente)\s+especialista\b/i,
  /\bespecialista\s+(?:em|de)\s+(?:algoritmo|youtube|conte[úu]do|nicho)/i,
  /\b(?:sou|eu\s+sou|sendo)\s+(?:o\s+|um\s+)?especialista\b/i,
  /\bcomo\s+especialista\b/i,
  /\bespecialista\s+(?:que|disponivel|dispon[íi]vel)\s+(?:dentro|na\s+mentoria)/i,
];

function splitSentences(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .flatMap((s) => s.split(/(?<=;)\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface IdentityGuardContext {
  /** Lead pediu explicitamente pessoa/humano/atendimento pessoal. */
  leadAskedHuman?: boolean;
  /** Conversa assumida por humano no Orbit. */
  humanTalk?: boolean;
  /** Handoff real autorizado (venda fechada, agendamento, ação humana externa). */
  handoffAuthorized?: boolean;
}

/** Handoff real está liberado neste turno? */
export function isHandoffAllowed(ctx: IdentityGuardContext | null | undefined): boolean {
  return ctx?.leadAskedHuman === true || ctx?.humanTalk === true || ctx?.handoffAuthorized === true;
}

function isOffendingSentence(sentence: string, handoffAllowed: boolean): boolean {
  if (SAFE_PATTERNS.some((re) => re.test(sentence))) return false;
  // Fernando em terceira pessoa é sempre violação: o agente é o Fernando.
  if (THIRD_PERSON_SELF_PATTERNS.some((re) => re.test(sentence))) return true;
  if (THIRD_PARTY_PATTERNS.some((re) => re.test(sentence))) {
    // Com handoff legítimo a transferência é real — mas "especialista/consultor"
    // fictício continua proibido.
    if (!handoffAllowed) return true;
    return new RegExp(`\\b${THIRD_PARTY_ROLE}\\b`, "i").test(sentence) &&
      !/\b(?:atendente|atendimento)\b/i.test(sentence);
  }
  return false;
}

export interface IdentityGuardVerdict {
  violates: boolean;
  sentences: string[];
  handoffAllowed: boolean;
}

/** Detecta falsa separação de identidade na fala do agente. */
export function detectIdentitySplit(
  text: string | null | undefined,
  ctx?: IdentityGuardContext | null,
): IdentityGuardVerdict {
  const handoffAllowed = isHandoffAllowed(ctx);
  const raw = String(text ?? "");
  if (!raw.trim()) return { violates: false, sentences: [], handoffAllowed };
  const offending = splitSentences(raw).filter((s) => isOffendingSentence(s, handoffAllowed));
  return { violates: offending.length > 0, sentences: offending, handoffAllowed };
}

/** Remove SOMENTE as cláusulas que criam terceiro, preservando o resto. */
export function sanitizeIdentitySplit(
  text: string | null | undefined,
  ctx?: IdentityGuardContext | null,
): string {
  const handoffAllowed = isHandoffAllowed(ctx);
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  const kept = splitSentences(raw).filter((s) => !isOffendingSentence(s, handoffAllowed));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** Fallback em primeira pessoa: mantém a condução com o Fernando, sem prometer terceiro. */
export const IDENTITY_GUARD_FALLBACK =
  "Eu mesmo continuo com você por aqui. Quer saber o investimento ou ficou outra dúvida?";

/** Fallback quando o handoff é legítimo: aviso neutro, sem inventar especialista. */
export const IDENTITY_GUARD_HANDOFF_FALLBACK =
  "Claro. Vou te chamar aqui mesmo para falarmos direto, sem intermediário.";

export const IDENTITY_GUARD_CORRECTIVE =
  "VIOLAÇÃO DE IDENTIDADE: você é o próprio Fernando Albuquerque, dono da Mentoria. É PROIBIDO oferecer, " +
  "prometer ou mencionar um especialista, consultor, atendente, equipe, responsável ou qualquer terceiro que " +
  "vá entrar em contato, assumir ou continuar a conversa, e é PROIBIDO falar do Fernando em terceira pessoa. " +
  "Você mesmo conduz e responde tudo, sempre em primeira pessoa. Reescreva a mensagem final em 1 a 3 frases " +
  "curtas, no máximo 350 caracteres e no máximo uma pergunta, mantendo o mesmo objetivo comercial: se o lead " +
  "já entendeu a oferta, siga você mesmo (aprofundar, oferecer o investimento ou propor o próximo passo). " +
  "Não peça e-mail, não peça localização e não invente preço, chave PIX ou link.";

/**
 * Aplica a trava. `applyGuard=false` (tenant sem a flag) devolve o texto intacto.
 */
export function enforceNoIdentitySplit(
  text: string,
  applyGuard: boolean,
  ctx?: IdentityGuardContext | null,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  if (!applyGuard) return { text, changed: false, fallbackUsed: false };
  const verdict = detectIdentitySplit(text, ctx);
  if (!verdict.violates) return { text, changed: false, fallbackUsed: false };
  const sanitized = sanitizeIdentitySplit(text, ctx);
  if (!sanitized) {
    return {
      text: verdict.handoffAllowed ? IDENTITY_GUARD_HANDOFF_FALLBACK : IDENTITY_GUARD_FALLBACK,
      changed: true,
      fallbackUsed: true,
    };
  }
  return { text: sanitized, changed: true, fallbackUsed: false };
}

/** Bloco de prompt tenant-scoped: identidade única, sem terceiro. */
export function buildIdentityPromptBlock(handoffAllowed: boolean): string {
  return [
    "\n=== IDENTIDADE ÚNICA (INVIOLÁVEL) ===",
    "Você é o próprio Fernando Albuquerque e conduz a conversa do início ao fim, sempre em primeira pessoa.",
    "PROIBIDO oferecer, prometer ou citar especialista, consultor, atendente, equipe, time, responsável, colega",
    "ou qualquer terceiro que vá entrar em contato, assumir ou continuar o atendimento.",
    "PROIBIDO falar do Fernando em terceira pessoa ou sugerir que o lead fale com o Fernando: você é ele.",
    "Quando o lead já entendeu a oferta, avance você mesmo: aprofunde, ofereça o investimento ou proponha o próximo passo.",
    'Permitido citar a "IA especialista em algoritmo do YouTube" — é uma ferramenta de apoio entregue na Mentoria, não uma pessoa.',
    handoffAllowed
      ? "Neste turno o lead pediu contato humano ou a conversa já é conduzida por pessoa: pode avisar que você mesmo continua por aqui, sem inventar outro especialista."
      : "Neste turno NÃO existe pedido de atendimento humano: não sugira nem insinue transferência de qualquer tipo.",
    "=== FIM DA IDENTIDADE ÚNICA ===\n",
  ].join("\n");
}

/**
 * Pedido explícito de atendimento humano na fala do LEAD.
 * Determinístico: só libera handoff quando o lead realmente pede pessoa.
 */
const RE_LEAD_ASKS_HUMAN: RegExp[] = [
  /\bfalar\s+com\s+(?:uma?\s+)?(?:pessoa|humano|gente\s+de\s+verdade|atendente|respons[áa]vel)\b/i,
  /\b(?:quero|queria|posso|d[áa]\s+pra|prefiro|preciso)\b[^.?!]{0,25}\bfalar\s+com\s+(?:algu[ée]m|uma?\s+pessoa|humano)\b/i,
  /\b(?:atendimento|suporte)\s+(?:humano|pessoal|com\s+pessoa)\b/i,
  /(?:^|\s)(?:isso\s+)?[ée]\s+(?:um\s+)?(?:rob[ôo]|bot|ia|intelig[êe]ncia\s+artificial)\b/i,
  /\bn[ãa]o\s+quero\s+(?:falar\s+com\s+)?(?:rob[ôo]|bot|ia)\b/i,
  /\bme\s+(?:liga|chama\s+no\s+telefone)\b/i,
];

export function leadRequestsHuman(inbound: string | null | undefined): boolean {
  const raw = String(inbound ?? "");
  if (!raw.trim()) return false;
  return RE_LEAD_ASKS_HUMAN.some((re) => re.test(raw));
}
