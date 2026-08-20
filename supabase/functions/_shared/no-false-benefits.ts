/**
 * Trava determinística contra PROMESSA DE BENEFÍCIO FALSO.
 *
 * Verdade oficial (Bullink): o comprador/mentorado NÃO recebe acesso a uma
 * "IA especialista em algoritmo do YouTube/Canal Dark", nem a qualquer
 * ferramenta/agente de IA entregue, nem a grupo de WhatsApp, grupo exclusivo,
 * comunidade ou suporte em grupo. O entregável real é o acompanhamento
 * individual direto com o Fernando por 3 meses e os demais itens cadastrados.
 *
 * Tenant-scoped por `orbit_ai_config.false_benefits_guard`.
 * Coluna NULL / `enabled != true` mantém os demais tenants byte-for-byte.
 *
 * O que NUNCA é bloqueado:
 *  - explicar que o MÉTODO usa IA para produzir canais/conteúdo (uso técnico,
 *    sem prometer acesso a ferramenta);
 *  - negar honestamente ("não faz parte da oferta", "não tem grupo");
 *  - acompanhamento individual de 3 meses e entregáveis verdadeiros.
 */

export interface FalseBenefitsGuardConfig {
  enabled: boolean;
}

export function readFalseBenefitsGuardConfig(
  aiConfig: Record<string, unknown> | null | undefined,
): FalseBenefitsGuardConfig | null {
  const raw = (aiConfig as any)?.false_benefits_guard;
  if (!raw || typeof raw !== "object") return null;
  if ((raw as any).enabled !== true) return null;
  return { enabled: true };
}

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function norm(s: string): string {
  return deaccent(String(s ?? "")).toLowerCase();
}

/** Verbos/expressões de entrega, acesso, inclusão ou bônus. */
const ACCESS_VERB =
  "(?:acesso|acessa\\w*|acessar|receb\\w+|ter[a]?|vai\\s+ter|vao\\s+ter|voce\\s+tem|tem\\s+acesso|libero|liber\\w+|entrego|entreg\\w+|disponibiliz\\w+|inclu\\w+|dou|damos|ganha\\w*|bonus|fornec\\w+|uso\\s+da)";

/** Substantivos de ferramenta/IA entregável. */
const AI_NOUN =
  "(?:ia|i\\.?a\\.?|inteligencia\\s+artificial|robo|bot|ferramenta\\w*|agente\\w*|software|gpt|plataforma)";

/** Nega honestamente => permitido. */
const NEGATION_RE = /\bnao\b|\bnenhum\w*\b|\bsem\b|\bnao\s+faz\s+parte\b|\bfora\b/;

const AI_ACCESS_PATTERNS: RegExp[] = [
  new RegExp(`\\b${ACCESS_VERB}\\b[^.;!?]{0,45}\\b${AI_NOUN}\\b`),
  new RegExp(`\\b${AI_NOUN}\\b[^.;!?]{0,45}\\b${ACCESS_VERB}\\b`),
  /\bia\s+especialista\b/,
  /\bespecialista\s+em\s+algoritmo\b/,
];

const GROUP_PATTERNS: RegExp[] = [
  /\bgrupos?\b/,
  /\bcomunidade\w*\b/,
  /\bsuporte\s+em\s+grupo\b/,
  /\bmentoria\s+em\s+grupo\b/,
];

function splitClauses(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .flatMap((s) => s.split(/(?<=[;:])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export type FalseBenefitKind = "ai_access" | "group";

function clauseViolation(clause: string): FalseBenefitKind | null {
  const n = norm(clause);
  if (NEGATION_RE.test(n)) return null;
  if (GROUP_PATTERNS.some((re) => re.test(n))) return "group";
  if (AI_ACCESS_PATTERNS.some((re) => re.test(n))) return "ai_access";
  return null;
}

export interface FalseBenefitsVerdict {
  violates: boolean;
  kinds: FalseBenefitKind[];
  clauses: string[];
}

export function detectFalseBenefits(text: string | null | undefined): FalseBenefitsVerdict {
  const raw = String(text ?? "");
  if (!raw.trim()) return { violates: false, kinds: [], clauses: [] };
  const clauses: string[] = [];
  const kinds = new Set<FalseBenefitKind>();
  for (const clause of splitClauses(raw)) {
    const kind = clauseViolation(clause);
    if (kind) {
      clauses.push(clause);
      kinds.add(kind);
    }
  }
  return { violates: clauses.length > 0, kinds: Array.from(kinds), clauses };
}

/** Remove SOMENTE as cláusulas com promessa falsa, preservando o resto verdadeiro. */
export function sanitizeFalseBenefits(text: string | null | undefined): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  return splitClauses(raw)
    .filter((c) => clauseViolation(c) === null)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const FALSE_BENEFITS_FALLBACK =
  "Isso não faz parte da oferta. O que você tem é acompanhamento individual direto comigo por 3 meses, " +
  "com definição de nicho validado, idiomas e estrutura do canal. Quer que eu detalhe como funciona?";

export const FALSE_BENEFITS_CORRECTIVE =
  "VIOLAÇÃO DE ENTREGÁVEL: é FALSO e PROIBIDO prometer acesso, entrega ou liberação de IA especialista, " +
  "agente, bot, ferramenta ou software, e é FALSO e PROIBIDO prometer grupo, grupo de WhatsApp, grupo " +
  "exclusivo, comunidade ou suporte em grupo. Nada disso faz parte da oferta. Você pode explicar que o " +
  "método usa IA na produção dos canais, desde que NÃO prometa acesso a nenhuma ferramenta. Reescreva a " +
  "mensagem final descrevendo somente entregáveis verdadeiros já cadastrados, com destaque para os 3 meses " +
  "de acompanhamento individual direto comigo. Se o lead perguntou sobre IA entregue ou grupo, diga de forma " +
  "curta e honesta que isso não faz parte da oferta. Máximo de 3 frases curtas e uma única pergunta.";

/** Bloco de prompt tenant-scoped. */
export function buildFalseBenefitsPromptBlock(): string {
  return [
    "\n=== ENTREGÁVEIS (VERDADE ABSOLUTA) ===",
    "NUNCA invente benefícios. Descreva somente entregáveis oficialmente confirmados.",
    "NÃO existe e é PROIBIDO prometer: acesso a IA especialista, agente, bot, ferramenta ou software entregue ao cliente.",
    "NÃO existe e é PROIBIDO prometer: grupo, grupo de WhatsApp, grupo exclusivo, comunidade ou suporte em grupo.",
    "Se o lead perguntar sobre IA entregue ou grupo, responda curto e honesto que isso não faz parte da oferta",
    "e redirecione para os 3 meses de acompanhamento individual direto comigo e os demais entregáveis reais.",
    "Você PODE explicar que o método usa IA na produção dos canais, sem prometer acesso a qualquer ferramenta.",
    "=== FIM DOS ENTREGÁVEIS ===\n",
  ].join("\n");
}

/** Aplica a trava. `applyGuard=false` devolve o texto intacto. */
export function enforceNoFalseBenefits(
  text: string,
  applyGuard: boolean,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  if (!applyGuard) return { text, changed: false, fallbackUsed: false };
  const verdict = detectFalseBenefits(text);
  if (!verdict.violates) return { text, changed: false, fallbackUsed: false };
  const sanitized = sanitizeFalseBenefits(text);
  if (!sanitized) return { text: FALSE_BENEFITS_FALLBACK, changed: true, fallbackUsed: true };
  return { text: sanitized, changed: true, fallbackUsed: false };
}
