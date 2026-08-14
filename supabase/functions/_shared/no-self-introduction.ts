/**
 * Trava determinística contra AUTOAPRESENTAÇÃO ARTIFICIAL.
 *
 * Problema real (Bullink): em toda retomada o agente abria com
 * "Aqui é o Fernando Albuquerque", "Eu sou o Fernando", "Fernando aqui".
 * O lead já sabe com quem fala; a fórmula soa robótica e artificial.
 *
 * O agente continua falando em primeira pessoa como Fernando — apenas entra
 * direto no contexto: cumprimento curto + resposta/pergunta útil.
 *
 * Tenant-scoped por `orbit_ai_config.self_introduction_guard`.
 * Coluna NULL/`enabled != true` preserva os demais tenants byte-for-byte.
 *
 * NÃO substitui o guard de identidade (`no-identity-split.ts`): aqui só se
 * remove a fórmula de apresentação, jamais menções legítimas ao nome feitas
 * pelo lead ou pelo contexto histórico.
 */

export interface SelfIntroductionGuardConfig {
  enabled: boolean;
  /** Nomes da persona cobertos pela trava (ordem: mais específico primeiro). */
  names: string[];
}

export const SELF_INTRO_DEFAULT_NAMES = ["Fernando Albuquerque", "Fernando"];

export function readSelfIntroductionGuardConfig(
  aiConfig: Record<string, unknown> | null | undefined,
): SelfIntroductionGuardConfig | null {
  const raw = (aiConfig as any)?.self_introduction_guard;
  if (!raw || typeof raw !== "object") return null;
  if ((raw as any).enabled !== true) return null;
  const names = Array.isArray((raw as any).names)
    ? ((raw as any).names as unknown[]).map((n) => String(n ?? "").trim()).filter(Boolean)
    : [];
  const list = (names.length ? names : SELF_INTRO_DEFAULT_NAMES)
    .slice()
    .sort((a, b) => b.length - a.length);
  return { enabled: true, names: list };
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Nome com tolerância a acento/caixa: "José" casa "jose". */
function nameToPattern(name: string): string {
  return escapeRe(name)
    .split(/\s+/)
    .map((part) => part.replace(/[aeiouAEIOUcC]/g, (ch) => {
      const map: Record<string, string> = {
        a: "[aáàâã]", e: "[eéê]", i: "[ií]", o: "[oóôõ]", u: "[uú]", c: "[cç]",
      };
      return map[ch.toLowerCase()] ?? ch;
    }))
    .join("\\s+");
}

/** Fórmulas de autoapresentação (cláusula completa, para remoção cirúrgica). */
export function buildSelfIntroPatterns(names: string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (const name of names) {
    const N = nameToPattern(name);
    patterns.push(
      // "Aqui é o Fernando", "aqui quem fala é o Fernando", "aqui e a Fernanda"
      new RegExp(`\\baqui\\s+(?:quem\\s+fala\\s+)?(?:é|e)\\s+(?:o\\s+|a\\s+)?${N}\\b[^.!?;]*`, "i"),
      // "Fernando aqui", "Fernando falando"
      new RegExp(`\\b${N}\\s+(?:aqui|falando)\\b[^.!?;]*`, "i"),
      // "eu sou o Fernando", "sou o Fernando Albuquerque"
      new RegExp(`\\b(?:eu\\s+)?sou\\s+(?:o\\s+|a\\s+)?${N}\\b[^.!?;]*`, "i"),
      // "me chamo Fernando", "meu nome é Fernando"
      new RegExp(`\\bme\\s+chamo\\s+${N}\\b[^.!?;]*`, "i"),
      new RegExp(`\\bmeu\\s+nome\\s+(?:é|e)\\s+${N}\\b[^.!?;]*`, "i"),
      // "quem fala é o Fernando", "quem te escreve é o Fernando"
      new RegExp(`\\bquem\\s+(?:fala|te\\s+escreve|escreve)\\s+(?:é|e)\\s+(?:o\\s+|a\\s+)?${N}\\b[^.!?;]*`, "i"),
      // "é o Fernando, da Mentoria" logo na abertura
      new RegExp(`^\\s*(?:é|e)\\s+(?:o\\s+|a\\s+)?${N}\\b[^.!?;]*`, "i"),
    );
  }
  return patterns;
}

export interface SelfIntroVerdict {
  violates: boolean;
  matches: string[];
}

export function detectSelfIntroduction(
  text: string | null | undefined,
  cfg: SelfIntroductionGuardConfig | null | undefined,
): SelfIntroVerdict {
  const raw = String(text ?? "");
  if (!cfg?.enabled || !raw.trim()) return { violates: false, matches: [] };
  const matches: string[] = [];
  for (const re of buildSelfIntroPatterns(cfg.names)) {
    const m = raw.match(re);
    if (m && m[0].trim()) matches.push(m[0].trim());
  }
  return { violates: matches.length > 0, matches };
}

function cleanupResidue(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    // pontuação órfã deixada pela remoção da cláusula
    .replace(/(^|[.!?;]\s*)[,;]\s*/g, "$1")
    .replace(/\s+([,.!?;])/g, "$1")
    .replace(/([.!?;])\s*\1+/g, "$1")
    .replace(/^[\s,;.!?-]+/, "")
    .trim();
}

/** Remove SOMENTE a fórmula de apresentação, preservando o resto da mensagem. */
export function sanitizeSelfIntroduction(
  text: string | null | undefined,
  cfg: SelfIntroductionGuardConfig | null | undefined,
): string {
  const raw = String(text ?? "");
  if (!cfg?.enabled || !raw.trim()) return raw.trim();
  let out = raw;
  for (const re of buildSelfIntroPatterns(cfg.names)) {
    out = out.replace(new RegExp(re.source, "gi"), "");
  }
  return cleanupResidue(out);
}

export const SELF_INTRO_GUARD_FALLBACK =
  "Vamos seguir de onde paramos. O que ficou de dúvida?";

export const SELF_INTRO_CORRECTIVE =
  "AUTOAPRESENTAÇÃO PROIBIDA: não escreva \"Aqui é o Fernando\", \"Eu sou o Fernando\", \"Fernando aqui\", " +
  "\"me chamo Fernando\" nem qualquer variação de apresentação. O lead já sabe com quem fala. " +
  "Continue em primeira pessoa, entre direto no contexto: cumprimento curto (opcional) + resposta ou pergunta útil. " +
  "Reescreva a mensagem final em 1 a 3 frases curtas, mantendo o mesmo objetivo comercial e sem inventar preço, link ou condição.";

/** Aplica a trava. `cfg` nulo (tenant sem a flag) devolve o texto intacto. */
export function enforceNoSelfIntroduction(
  text: string,
  cfg: SelfIntroductionGuardConfig | null | undefined,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  if (!cfg?.enabled) return { text, changed: false, fallbackUsed: false };
  if (!detectSelfIntroduction(text, cfg).violates) return { text, changed: false, fallbackUsed: false };
  const sanitized = sanitizeSelfIntroduction(text, cfg);
  if (!sanitized) return { text: SELF_INTRO_GUARD_FALLBACK, changed: true, fallbackUsed: true };
  return { text: sanitized, changed: true, fallbackUsed: false };
}

/** Bloco de prompt tenant-scoped. */
export function buildNoSelfIntroPromptBlock(cfg: SelfIntroductionGuardConfig): string {
  const primary = cfg.names[0] ?? "a persona";
  return [
    "\n=== SEM AUTOAPRESENTAÇÃO (INVIOLÁVEL) ===",
    `Você é ${primary} e fala sempre em primeira pessoa, mas NUNCA se apresenta.`,
    'PROIBIDO escrever "Aqui é o ' + primary + '", "Eu sou o ' + primary + '", "' + primary + ' aqui",',
    '"me chamo ' + primary + '", "meu nome é ' + primary + '" ou qualquer variação, inclusive em retomadas.',
    "Entre direto no contexto: cumprimento curto (opcional) e já a resposta ou a pergunta útil.",
    "=== FIM DA REGRA DE APRESENTAÇÃO ===\n",
  ].join("\n");
}
