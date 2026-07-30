// Memória canônica do agente Orbit + guards determinísticos.
//
// Objetivos:
//  1. Hidratar os fatos conhecidos do lead a partir de múltiplas fontes,
//     com prioridade: correção explícita na conversa > ai_contexto >
//     colunas do prospect > prospect.dados_adicionais.
//  2. Expor esses fatos como bloco autoritativo no prompt.
//  3. Impedir deterministicamente que o agente pergunte algo já conhecido
//     ou repita uma pergunta recente.
//  4. Impedir reapresentação da persona depois da primeira mensagem.
//
// Tudo aqui é tenant-neutro: nenhum nome de empresa, produto ou pessoa.

export interface CanonicalFact {
  key: string;
  label: string;
  value: string;
  source: "correction" | "ai_contexto" | "prospect" | "dados_adicionais";
}

export type CanonicalFacts = Record<string, CanonicalFact>;

export interface CanonicalFieldDef {
  key: string;
  label: string;
  /** Aliases usados tanto para casar chaves de origem quanto para detectar perguntas. */
  aliases: string[];
  /** Colunas do prospect que alimentam o campo. */
  prospectColumns?: string[];
  /** Valores enumerados reconhecíveis em correções explícitas. */
  enumValues?: string[];
}

export const CANONICAL_FIELDS: CanonicalFieldDef[] = [
  {
    key: "nome",
    label: "Nome",
    aliases: ["nome", "nome completo", "seu nome", "como se chama", "como posso te chamar", "nome_razao", "nome_contato"],
    prospectColumns: ["nome_contato", "nome_razao"],
  },
  {
    key: "email",
    label: "E-mail",
    aliases: ["email", "e-mail", "seu email", "email_principal", "melhor email"],
    prospectColumns: ["email_principal"],
  },
  {
    key: "telefone",
    label: "Telefone",
    aliases: ["telefone", "whatsapp", "celular", "numero de contato", "telefone_whatsapp"],
    prospectColumns: ["telefone_whatsapp", "telefone"],
  },
  {
    key: "objetivo_nivel",
    label: "Objetivo / nível pretendido",
    aliases: [
      "objetivo", "nivel", "nivel pretendido", "mestrado ou doutorado", "mestrado", "doutorado",
      "objetivo_nivel", "nivel_academico", "nivel_pretendido", "curso pretendido", "programa",
      "pos graduacao", "pos-graduacao",
    ],
    enumValues: ["mestrado", "doutorado", "especializacao", "mba", "graduacao", "pos-doutorado"],
  },
  {
    key: "cidade",
    label: "Cidade",
    aliases: ["cidade", "de onde voce e", "de onde voce fala", "sua cidade", "municipio", "localizacao", "onde voce mora"],
    prospectColumns: ["cidade"],
  },
  {
    key: "estado",
    label: "Estado",
    aliases: ["estado", "uf", "qual estado"],
    prospectColumns: ["estado", "uf"],
  },
  {
    key: "formacao",
    label: "Formação",
    aliases: ["formacao", "formacao academica", "graduado em", "sua graduacao", "qual sua formacao"],
  },
  {
    key: "area_pretendida",
    label: "Área pretendida",
    aliases: ["area", "area pretendida", "area de interesse", "linha de pesquisa", "qual area"],
  },
  {
    key: "edital",
    label: "Edital",
    aliases: ["edital", "processo seletivo", "qual edital", "seletivo"],
  },
  {
    key: "instituicao",
    label: "Instituição",
    aliases: ["instituicao", "universidade", "faculdade", "qual instituicao", "programa alvo"],
  },
  {
    key: "prazo",
    label: "Prazo",
    aliases: ["prazo", "data limite", "quando pretende", "para quando", "deadline", "cronograma"],
  },
  {
    key: "etapa_atual",
    label: "Etapa atual",
    aliases: ["etapa", "etapa atual", "em que fase", "em que etapa", "momento atual", "status atual"],
  },
  {
    key: "dificuldade",
    label: "Principal dificuldade",
    aliases: ["dificuldade", "maior dificuldade", "principal dificuldade", "desafio", "dor"],
  },
  {
    key: "renda_capital",
    label: "Renda / capital disponível",
    aliases: ["renda", "capital", "investimento", "orcamento", "quanto pode investir", "faixa de investimento", "budget"],
  },
  {
    key: "empresa",
    label: "Empresa",
    aliases: ["empresa", "nome da empresa", "razao social", "nome_fantasia"],
    prospectColumns: ["nome_fantasia"],
  },
  {
    key: "segmento",
    label: "Segmento",
    aliases: ["segmento", "ramo", "area de atuacao"],
    prospectColumns: ["segmento"],
  },
];

export function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIAS_TO_FIELD: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const f of CANONICAL_FIELDS) {
    map[normalizeKey(f.key)] = f.key;
    for (const a of f.aliases) map[normalizeKey(a)] = f.key;
    for (const c of f.prospectColumns ?? []) map[normalizeKey(c)] = f.key;
  }
  return map;
})();

export function resolveCanonicalKey(rawKey: string): string | null {
  return ALIAS_TO_FIELD[normalizeKey(rawKey)] ?? null;
}

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  if (!s) return false;
  if (/^(null|undefined|n\/a|nao informado|não informado)$/i.test(s)) return false;
  if (/^whatsapp\s/i.test(s)) return false; // placeholder de prospect criado pelo webhook
  return true;
}

function put(
  facts: CanonicalFacts,
  key: string | null,
  value: unknown,
  source: CanonicalFact["source"],
  priority: number,
  seen: Record<string, number>,
) {
  if (!key || !isMeaningful(value)) return;
  const current = seen[key];
  if (current !== undefined && current >= priority) return;
  const def = CANONICAL_FIELDS.find((f) => f.key === key);
  facts[key] = { key, label: def?.label ?? key, value: String(value).trim(), source };
  seen[key] = priority;
}

const CORRECTION_RE = /\b(na verdade|corrigindo|corrijo|nao e|não é|nao sou|não sou|errado|me confundi|e (o|a)? ?contrario|quis dizer)\b/i;

/**
 * Extrai correções explícitas de campos enumerados nas mensagens do lead.
 * Só considera valores inequívocos (enumValues) para evitar falso positivo.
 */
export function extractExplicitCorrections(
  mensagens: Array<{ direcao?: string | null; mensagem?: string | null; media_extracted_text?: string | null }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mensagens ?? []) {
    if ((m.direcao || "").toUpperCase() !== "IN") continue;
    const text = `${m.mensagem ?? ""} ${m.media_extracted_text ?? ""}`;
    if (!CORRECTION_RE.test(text)) continue;
    const norm = normalizeKey(text);
    for (const f of CANONICAL_FIELDS) {
      if (!f.enumValues) continue;
      for (const v of f.enumValues) {
        if (norm.includes(normalizeKey(v))) out[f.key] = v;
      }
    }
  }
  return out;
}

export function hydrateCanonicalFacts(params: {
  prospect?: Record<string, unknown> | null;
  aiContexto?: Record<string, unknown> | null;
  mensagens?: Array<{ direcao?: string | null; mensagem?: string | null; media_extracted_text?: string | null }> | null;
}): CanonicalFacts {
  const facts: CanonicalFacts = {};
  const seen: Record<string, number> = {};
  const prospect = (params.prospect ?? {}) as Record<string, unknown>;
  const aiContexto = (params.aiContexto ?? {}) as Record<string, unknown>;
  const dadosAdicionais = (prospect.dados_adicionais ?? {}) as Record<string, unknown>;
  const camposColetados = (aiContexto.campos_coletados ?? {}) as Record<string, unknown>;

  // Prioridade 1 (menor): dados_adicionais do formulário
  for (const [k, v] of Object.entries(dadosAdicionais)) {
    put(facts, resolveCanonicalKey(k), v, "dados_adicionais", 1, seen);
  }
  // Prioridade 2: colunas do prospect
  for (const f of CANONICAL_FIELDS) {
    for (const col of f.prospectColumns ?? []) {
      put(facts, f.key, prospect[col], "prospect", 2, seen);
    }
  }
  // Prioridade 3: ai_contexto.campos_coletados
  for (const [k, v] of Object.entries(camposColetados)) {
    put(facts, resolveCanonicalKey(k), v, "ai_contexto", 3, seen);
  }
  // Prioridade 4 (maior): correções explícitas do lead
  const corrections = extractExplicitCorrections(params.mensagens ?? []);
  for (const [k, v] of Object.entries(corrections)) {
    put(facts, k, v, "correction", 4, seen);
  }
  return facts;
}

export function buildCanonicalFactsBlock(facts: CanonicalFacts): string {
  const entries = Object.values(facts);
  if (entries.length === 0) return "";
  const lines = entries.map((f) => `- ${f.label} (${f.key}): ${f.value}`).join("\n");
  return [
    "\n=== FATOS CANÔNICOS DO LEAD (AUTORITATIVOS — JÁ CONHECIDOS) ===",
    lines,
    "Estes dados vieram do formulário/cadastro e são FATOS. NUNCA pergunte novamente nenhum deles.",
    "Só reconfirme um destes valores se o próprio lead corrigir explicitamente ou se o valor for realmente ambíguo.",
    "=== FIM DOS FATOS CANÔNICOS ===\n",
  ].join("\n");
}

// ── Guard determinístico contra repetição ──

export function extractQuestions(text: string): string[] {
  if (!text) return [];
  return String(text)
    .split(/(?<=[?!.])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("?"));
}

function tokens(text: string): string[] {
  return normalizeKey(text).split(" ").filter((t) => t.length > 2);
}

export function questionSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / new Set([...ta, ...tb]).size;
}

/** Perguntas feitas pelo agente nas últimas `limit` mensagens OUT. */
export function recentAgentQuestions(
  mensagens: Array<{ direcao?: string | null; mensagem?: string | null }>,
  limit = 4,
): string[] {
  const outs = (mensagens ?? []).filter((m) => (m.direcao || "").toUpperCase() === "OUT");
  const lastOuts = outs.slice(-limit);
  return lastOuts.flatMap((m) => extractQuestions(m.mensagem ?? ""));
}

export interface RepetitionVerdict {
  violates: boolean;
  reason?: "asks_known_field" | "repeats_recent_question";
  field?: string;
  question?: string;
}

export function detectRepetition(
  resposta: string,
  facts: CanonicalFacts,
  previousQuestions: string[],
): RepetitionVerdict {
  const questions = extractQuestions(resposta);
  for (const q of questions) {
    const nq = normalizeKey(q);
    for (const fact of Object.values(facts)) {
      const def = CANONICAL_FIELDS.find((f) => f.key === fact.key);
      const aliases = [fact.key, ...(def?.aliases ?? [])];
      for (const alias of aliases) {
        const na = normalizeKey(alias);
        if (na.length < 4) continue;
        if (nq.includes(na)) {
          return { violates: true, reason: "asks_known_field", field: fact.key, question: q };
        }
      }
    }
    for (const prev of previousQuestions) {
      if (questionSimilarity(q, prev) >= 0.6) {
        return { violates: true, reason: "repeats_recent_question", question: q };
      }
    }
  }
  return { violates: false };
}

export function buildCorrectiveInstruction(verdict: RepetitionVerdict, facts: CanonicalFacts): string {
  if (verdict.reason === "asks_known_field") {
    const fact = verdict.field ? facts[verdict.field] : undefined;
    return [
      "CORREÇÃO OBRIGATÓRIA: sua resposta anterior perguntou um dado que já é conhecido",
      fact ? `(${fact.label} = "${fact.value}").` : ".",
      "Reescreva a resposta usando esse dado como fato e, se precisar perguntar algo, pergunte APENAS um campo realmente ausente.",
      "Não repita nenhuma pergunta já feita e não reapresente sua identidade.",
    ].join(" ");
  }
  return [
    "CORREÇÃO OBRIGATÓRIA: sua resposta repetiu uma pergunta já feita recentemente",
    verdict.question ? `("${verdict.question}").` : ".",
    "Reescreva avançando a conversa, sem repetir perguntas e sem reapresentar sua identidade.",
  ].join(" ");
}

/** Fallback determinístico: pergunta apenas o próximo campo realmente ausente. */
export function buildDeterministicFallback(
  facts: CanonicalFacts,
  camposQualificacao: Array<{ key?: string; label?: string; pergunta?: string; required?: boolean }>,
  previousQuestions: string[] = [],
): string {
  for (const campo of camposQualificacao ?? []) {
    if (!campo?.key) continue;
    const canonical = resolveCanonicalKey(campo.key);
    if (canonical && facts[canonical]) continue;
    if (facts[campo.key]) continue;
    const pergunta = (campo.pergunta || campo.label || "").trim();
    if (!pergunta) continue;
    const repeated = previousQuestions.some((p) => questionSimilarity(p, pergunta) >= 0.6);
    if (repeated) continue;
    return pergunta.endsWith("?") ? pergunta : `${pergunta}?`;
  }
  return "Perfeito, anotei. Me conta um pouco mais sobre o que você precisa que eu já te oriento.";
}

// ── Identidade e continuidade ──

const NAME = "[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*";
const CAP_NAME = "[A-ZÀ-Ý][A-Za-zÀ-ÿ.'-]*";

// Frases de auto-apresentação. Recortamos apenas a oração, nunca a frase inteira.
const PERSONA_PATTERNS: RegExp[] = [
  new RegExp(`(?:aqui\\s+)?quem\\s+fala\\s+(?:é|e)\\s+(?:a|o)\\s+${NAME}`, "giu"),
  new RegExp(`aqui\\s+(?:é|e)\\s+(?:a|o)\\s+${NAME}`, "giu"),
  new RegExp(`(?:é|e)\\s+(?:a|o)\\s+${NAME}\\s+mesm[ao]`, "giu"),
  new RegExp(`sou\\s+(?:a|o)\\s+${CAP_NAME}`, "gu"),
  new RegExp(`me\\s+chamo\\s+${CAP_NAME}`, "gu"),
  new RegExp(`meu\\s+nome\\s+(?:é|e)\\s+${CAP_NAME}`, "giu"),
];

const GREETING_ONLY_RE = /^(oi|ol[áa]|opa|e a[íi]|bom dia|boa tarde|boa noite)[\s,!.]*(tudo bem|tudo bom|como vai)?[\s,!?.]*$/i;

function cleanupClause(value: string): string {
  return value
    .replace(/\s*,\s*,/g, ",")
    .replace(/^[\s,;.!-]+/, "")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

/** Remove reapresentações de persona e saudações redundantes (após a 1ª mensagem). */
export function stripPersonaReintroduction(text: string): string {
  if (!text) return "";
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (GREETING_ONLY_RE.test(sentence.replace(/[.!?]+$/, ""))) continue;
    let cleaned = sentence;
    for (const re of PERSONA_PATTERNS) {
      re.lastIndex = 0;
      cleaned = cleaned.replace(re, "");
    }
    cleaned = cleanupClause(cleaned);
    // Sobrou apenas pontuação/saudação → descarta a frase.
    if (!cleaned || /^[,.;!?\s]*$/.test(cleaned)) continue;
    cleaned = cleaned.replace(/^(oi|ol[áa]|opa|bom dia|boa tarde|boa noite)[\s,!]+/i, "");
    cleaned = cleanupClause(cleaned);
    if (!cleaned) continue;
    kept.push(capitalizeFirst(cleaned));
  }
  const out = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  return out;
}

export function containsPersonaReintroduction(text: string): boolean {
  const value = String(text ?? "");
  return PERSONA_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(value);
  });
}
