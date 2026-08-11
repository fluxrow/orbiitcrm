// scripts/bullink-dialog-dryrun.ts
// Dry-run dos diálogos da Bullink. NÃO toca fila real, NÃO cria lead, NÃO chama Z-API.
// Uso: deno run -A scripts/bullink-dialog-dryrun.ts config.json
//
// Instrumenta globalThis.fetch para provar zero chamada a api.z-api.io.
import { buildProofOutboxPayload, buildZapiVideoBody, isProofRequest, proofPayloadType } from "../supabase/functions/_shared/proof-media.ts";

const cfg = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const MEDIA = JSON.parse(await Deno.readTextFile(Deno.args[1]));

const fetchLog: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  fetchLog.push(new URL(url).host);
  return realFetch(input, init);
}) as typeof fetch;

const SYSTEM = `${cfg.prompt_identidade}

FORMATO OBRIGATÓRIO: WhatsApp. 1 a 3 frases curtas por balão. Sem listas, sem textão.
Tom de voz: ${cfg.tom_conversa}
Idioma: Português do Brasil

ROTEIRO DE QUALIFICAÇÃO:
${cfg.prompt_roteiro}

=== REGRAS INVIOLÁVEIS (MAIOR PESO) ===
${cfg.prompt_regras}
=== FIM DAS REGRAS INVIOLÁVEIS ===

Responda SOMENTE em JSON: {"intencao":"...","mensagem":"..."}`;

async function ask(turns: Array<{ role: "user" | "assistant"; content: string }>): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      system: SYSTEM,
      max_tokens: 500,
      temperature: 0.3,
      messages: turns,
    }),
  });
  const json = await resp.json();
  const text = (json.content ?? []).map((b: any) => b.text ?? "").join("");
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).mensagem;
  } catch {
    return text;
  }
}

function frases(t: string): number {
  // Neutraliza pontos que não terminam frase: decimais/milhares (R$ 6.500,00),
  // siglas (F.A.) e URLs — senão a contagem estoura por artefato de parsing.
  const norm = t
    .replace(/https?:\/\/\S+/g, "URL")
    .replace(/(\d)[.,](\d)/g, "$1$2")
    .replace(/\b([A-Z])\.(?=[A-Z]\.)/g, "$1")
    .replace(/\b([A-Z])\.(?=\s|$)/g, "$1");
  return norm.split(/[.!?…]+\s|\n+/).map((s) => s.trim()).filter(Boolean).length;
}

const results: Record<string, unknown> = {};
const fails: string[] = [];
const check = (name: string, cond: boolean) => {
  if (!cond) fails.push(name);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};

// ── D1: prova social ──
const leadProva = "Você tem alguma prova de resultado de aluno?";
const r1 = await ask([{ role: "user", content: leadProva }]);
console.log(`\n=== DIÁLOGO 1 (prova social) ===\nLEAD: ${leadProva}\nFERNANDO: ${r1}`);
const proof = isProofRequest(leadProva);
const payload = buildProofOutboxPayload({ id: MEDIA.id, kind: MEDIA.kind, caption: MEDIA.caption, storage_path: MEDIA.storage_path });
const zbody = buildZapiVideoBody("5531999999999", MEDIA.signed_url, MEDIA.caption);
console.log("AÇÃO: send-video (dry_run) payload_type=" + proofPayloadType(MEDIA.kind));
console.log("PAYLOAD OUTBOX: " + JSON.stringify(payload));
console.log("BODY Z-API (dry_run, não enviado): " + JSON.stringify({ ...zbody, video: "<signed_url_fresh>" }));
check("D1 gatilho de prova detectado", proof);
check("D1 resposta curta (<=3 frases)", frases(r1) <= 3);
check("D1 texto sem filename/storage_path", !/\.mp4|storage_path|orbit-media|4f6b4a18/i.test(r1));
check("D1 payload sem fileName/filename", !/filename/i.test(JSON.stringify(payload)) && !/filename/i.test(JSON.stringify(zbody)));
check("D1 body Z-API é {phone,video,caption}", Object.keys(zbody).sort().join(",") === "caption,phone,video");
check("D1 signed url fresca e assinada", /token=|X-Amz-|\?/.test(MEDIA.signed_url));
results.d1 = { lead: leadProva, fernando: r1, payload, zapi_keys: Object.keys(zbody) };

// ── D2: nicho ──
const leadNicho = "Eu não sei escolher nicho, isso é o que mais me travou. Como funciona?";
const r2 = await ask([{ role: "user", content: leadNicho }]);
console.log(`\n=== DIÁLOGO 2 (nicho) ===\nLEAD: ${leadNicho}\nFERNANDO: ${r2}`);
check("D2 resposta curta (<=3 frases)", frases(r2) <= 3);
check("D2 cita nichos validados", /nicho.{0,40}validad|validad.{0,40}nicho/i.test(r2));
check("D2 cita idiomas", /idioma/i.test(r2));
check("D2 cita 3 meses de acompanhamento", /(3|três)\s*meses/i.test(r2));
results.d2 = { lead: leadNicho, fernando: r2 };

// ── D3: preço em duas interações ──
const leadPreco = "Quanto custa a mentoria? Dá no cartão?";
const r3a = await ask([{ role: "user", content: leadPreco }]);
console.log(`\n=== DIÁLOGO 3 (preço, 2 interações) ===\nLEAD: ${leadPreco}\nFERNANDO: ${r3a}`);
const leadCartao = "No cartão.";
const r3b = await ask([
  { role: "user", content: leadPreco },
  { role: "assistant", content: r3a },
  { role: "user", content: leadCartao },
]);
console.log(`LEAD: ${leadCartao}\nFERNANDO: ${r3b}`);
check("D3.1 pergunta a forma de pagamento", /pix/i.test(r3a) && /cart[ãa]o/i.test(r3a) && /\?/.test(r3a));
check("D3.1 sem link antes da escolha", !/hypercash/i.test(r3a));
check("D3.2 informa 12x de R$ 642,44", /12x\s*de\s*R\$\s*642[.,]44/i.test(r3b));
check("D3.2 envia link Hypercash correto", r3b.includes("https://pay.hypercash.com.br/pt/payment-link/043ec27e-a362-4d27-82c3-f66f61b867bb"));
check("D3.2 sem total acumulado", !/7\.?709|7709|total de r\$/i.test(r3b));
check("D3 respostas curtas (1-3 frases)", frases(r3a) >= 1 && frases(r3a) <= 3 && frases(r3b) >= 1 && frases(r3b) <= 3);
check("D3.1 sem valores antes da escolha", !/642[.,]44|6\.?500/.test(r3a));
results.d3 = { lead1: leadPreco, fernando1: r3a, lead2: leadCartao, fernando2: r3b };

// ── Zero fetch externo à Z-API ──
const hosts = Array.from(new Set(fetchLog));
console.log("\nHOSTS CHAMADOS: " + hosts.join(", "));
check("ZERO chamada a api.z-api.io", !hosts.some((h) => h.includes("z-api")));

console.log("\nRESUMO: " + (fails.length === 0 ? "TODOS OS CHECKS PASSARAM" : `FALHAS: ${fails.join(" | ")}`));
await Deno.writeTextFile("/tmp/bullink-dialogs.json", JSON.stringify(results, null, 2));
if (fails.length) Deno.exit(1);
