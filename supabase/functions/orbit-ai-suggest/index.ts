import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claims?.user) {
      return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);
    }

    const { conversa_id, prospect_id, ultima_mensagem } = await req.json();

    // Buscar config IA
    const { data: aiConfig } = await supabase.from("orbit_ai_config").select("*").maybeSingle();

    // Buscar prospect
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", prospect_id).maybeSingle();

    // Buscar histórico
    const { data: mensagens } = await supabase
      .from("orbit_mensagens")
      .select("direcao, mensagem, timestamp")
      .eq("conversa_id", conversa_id)
      .order("timestamp", { ascending: false })
      .limit(10);

    const historicoFormatado = (mensagens || [])
      .reverse()
      .map((m) => `${m.direcao === "IN" ? "Cliente" : "Assistente"}: ${m.mensagem}`)
      .join("\n");

    const systemPrompt = `Você é um assistente de vendas ajudando um humano a responder um cliente.

Tom de voz: ${aiConfig?.tom_conversa || "profissional e amigável"}

Contexto do prospect:
- Nome: ${prospect?.nome_razao || "não informado"}
- Segmento: ${prospect?.segmento || "não informado"}
- Cidade: ${prospect?.cidade || "não informada"}

Gere 3 sugestões de resposta diferentes, do mais formal ao mais casual.

Responda em JSON:
{
  "sugestoes": [
    { "tipo": "formal", "mensagem": "..." },
    { "tipo": "amigavel", "mensagem": "..." },
    { "tipo": "casual", "mensagem": "..." }
  ]
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Histórico:\n${historicoFormatado}\n\nÚltima mensagem do cliente: "${ultima_mensagem}"\n\nGere sugestões de resposta.` },
        ],
        temperature: 0.8,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return fail(ErrorCodes.PROVIDER_RATE_LIMIT, "Limite de taxa excedido. Tente novamente mais tarde.", 429);
      }
      if (aiResponse.status === 402) {
        return fail(ErrorCodes.PROVIDER_AUTH_FAILED, "Créditos de IA insuficientes.", 402);
      }
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { sugestoes: [] };
    } catch {
      parsed = { sugestoes: [{ tipo: "amigavel", mensagem: content }] };
    }

    return ok(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-ai-suggest] Erro:", message);
    return fail(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
});
