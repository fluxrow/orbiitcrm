// Health check do provedor de IA (Anthropic) — leitura pura, zero persistência.
//
// Existe para provar, sem enviar WhatsApp e sem gravar nada no banco, se a chave
// do provedor está válida e com crédito. NÃO recebe prompt do cliente, NÃO
// aceita parâmetros, NÃO retorna texto gerado e NÃO expõe segredo: apenas o
// veredito (`ok`), o código classificado (`credits`, `rate_limit`, `auth`, ...) e
// o status HTTP do provedor.
//
// Custo por chamada: 1 token de saída. Throttle em memória de 30s por isolate
// evita uso abusivo.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callAnthropic, ANTHROPIC_DEFAULT_MODEL } from "../_shared/anthropic.ts";

const THROTTLE_MS = 30_000;
let lastCallAt = 0;
let lastResult: Record<string, unknown> | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const now = Date.now();
  if (lastResult && now - lastCallAt < THROTTLE_MS) {
    return json(200, { ok: true, data: { ...lastResult, cached: true } });
  }

  const started = Date.now();
  const result = await callAnthropic({
    model: ANTHROPIC_DEFAULT_MODEL,
    system: "ping",
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    temperature: 0,
  });

  lastCallAt = Date.now();
  lastResult = result.ok
    ? { provider: "anthropic", model: ANTHROPIC_DEFAULT_MODEL, provider_ok: true, latency_ms: Date.now() - started }
    : {
      provider: "anthropic",
      model: ANTHROPIC_DEFAULT_MODEL,
      provider_ok: false,
      code: result.code,
      status: result.status,
      latency_ms: Date.now() - started,
    };

  return json(200, { ok: true, data: { ...lastResult, cached: false } });
});
