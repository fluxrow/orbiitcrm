// Normalização determinística de PT-BR para mensagens do agente Orbit.
//
// Regras:
//  1. Corrige palavras sem acento comumente omitidas por LLMs
//     (voce→você, voces→vocês, avancar→avançar, e um conjunto amplo abaixo).
//  2. Remove travessão "—" (U+2014) e meia-risca "–" (U+2013),
//     substituindo por vírgula ou ponto conforme o contexto,
//     preservando hífens legítimos ("pós-graduação", "day-trade").
//  3. Reescreve frases mecânicas de processo como "antes de avançar",
//     "para avançarmos" e "dar o próximo passo" em versões humanas.
//
// A função é idempotente e segura para rodar múltiplas vezes.

// Mapa de correções (chave em minúsculo, sem acento). O replace é
// case-insensitive e preserva a capitalização da primeira letra.
const ACCENT_FIXES: Record<string, string> = {
  voce: "você",
  voces: "vocês",
  avancar: "avançar",
  avancarmos: "avançarmos",
  avancamos: "avançamos",
  avanca: "avança",
  avanco: "avanço",
  nao: "não",
  entao: "então",
  eh: "é",
  esta: "está",
  estao: "estão",
  ja: "já",
  tambem: "também",
  atencao: "atenção",
  informacao: "informação",
  informacoes: "informações",
  proximo: "próximo",
  proxima: "próxima",
  atras: "atrás",
  seria: "seria",
  duvida: "dúvida",
  duvidas: "dúvidas",
  possivel: "possível",
  facil: "fácil",
  dificil: "difícil",
  ninguem: "ninguém",
  alguem: "alguém",
  porem: "porém",
  atraves: "através",
  historia: "história",
  reuniao: "reunião",
  reunioes: "reuniões",
  opcao: "opção",
  opcoes: "opções",
  decisao: "decisão",
  decisoes: "decisões",
  producao: "produção",
  formacao: "formação",
  operacao: "operação",
  situacao: "situação",
  condicao: "condição",
  condicoes: "condições",
  posicao: "posição",
  posicoes: "posições",
  servico: "serviço",
  servicos: "serviços",
  preco: "preço",
  precos: "preços",
  comercio: "comércio",
  negocio: "negócio",
  negocios: "negócios",
  numero: "número",
  numeros: "números",
  ate: "até",
  apos: "após",
  ontem: "ontem",
  hoje: "hoje",
  amanha: "amanhã",
  familia: "família",
  ideia: "ideia",
  ideias: "ideias",
  meta: "meta",
  esta_ai: "está aí",
  vao: "vão",
  vamos: "vamos",
};

function preserveCase(source: string, replacement: string): string {
  if (!source) return replacement;
  const first = source[0];
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyAccentFixes(input: string): string {
  let out = input;
  for (const [wrong, right] of Object.entries(ACCENT_FIXES)) {
    // \b não trata bem palavras com acento no lado direito, mas basta para
    // as formas sem acento à esquerda.
    const re = new RegExp(`\\b(${wrong})\\b`, "giu");
    out = out.replace(re, (m) => preserveCase(m, right));
  }
  return out;
}

// Substitui travessão/meia-risca preservando hífens legítimos entre letras.
// Estes caracteres NUNCA são hífens compostos válidos em PT-BR — hífens
// compostos usam "-" (U+002D). Portanto removemos os dois de forma segura.
function replaceDashes(input: string): string {
  let out = input;
  // Padrão: " — " → ", "  (mais natural do que ponto no meio de frase).
  out = out.replace(/\s*[—–]\s*/g, ", ");
  // Se sobrou algum caractere isolado, apaga.
  out = out.replace(/[—–]/g, "");
  // Evita ", , " ou " ,," resultantes.
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/\s+,/g, ",");
  return out;
}

// Reescreve frases mecânicas em versões humanas.
function humanizeProcessLanguage(input: string): string {
  let out = input;
  out = out.replace(/\bantes de avançar\b/giu, "antes disso");
  out = out.replace(/\bantes de avancar\b/giu, "antes disso");
  out = out.replace(/\bpara avançarmos\b/giu, "para seguir");
  out = out.replace(/\bpara avancarmos\b/giu, "para seguir");
  out = out.replace(/\bdar o próximo passo\b/giu, "seguir");
  out = out.replace(/\bdar o proximo passo\b/giu, "seguir");
  return out;
}

// Aplica um passe adicional para colapsar espaços e vírgulas duplicadas
// deixadas por passos anteriores.
function tidyWhitespace(input: string): string {
  return input
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

export function normalizeAgentText(input: string | null | undefined): string {
  if (!input) return "";
  let out = String(input);
  out = replaceDashes(out);
  out = applyAccentFixes(out);
  out = humanizeProcessLanguage(out);
  out = tidyWhitespace(out);
  return out;
}

export const PT_BR_STYLE_GUARDRAILS = [
  "Escreva sempre em português brasileiro correto, com acentos e cedilha.",
  "Nunca escreva 'voce', 'voces' ou 'avancar' sem acento — use 'você', 'vocês', 'avançar'.",
  "Nunca use travessão (—) nem meia-risca (–). Use ponto ou vírgula conforme o contexto. Hífens legítimos como 'pós-graduação' devem ser mantidos.",
  "Evite linguagem mecânica de processo como 'antes de avançar', 'para avançarmos' ou 'dar o próximo passo'. Fale de forma humana e direta.",
].join("\n");
