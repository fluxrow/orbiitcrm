import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

const okJson = (data: unknown, corsHeaders: Record<string, string>) =>
  new Response(JSON.stringify({ ok: true, data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errJson = (
  code: string,
  message: string,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, { allowHeaders: ALLOW_HEADERS });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errJson("AUTH_REQUIRED", "Token required", corsHeaders);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return errJson("AUTH_INVALID", "Invalid token", corsHeaders);

    const { canal, categoria, objetivo } = await req.json();
    if (!canal || !objetivo) {
      return errJson("VALIDATION_ERROR", "canal and objetivo are required", corsHeaders);
    }

    // Get empresa_id and AI config for tom_conversa
    const { data: profile } = await supabaseAdmin.from("profiles").select("empresa_id").eq("id", user.id).single();
    let tomConversa = "profissional e amigável";

    if (profile?.empresa_id) {
      const { data: aiConfig } = await supabaseAdmin
        .from("orbit_ai_config")
        .select("tom_conversa")
        .eq("empresa_id", profile.empresa_id)
        .maybeSingle();
      if (aiConfig?.tom_conversa) tomConversa = aiConfig.tom_conversa;
    }

    const isEmail = canal === "email";
    const systemPrompt = `Você é um especialista em marketing e comunicação. Gere templates de mensagem para ${canal === "whatsapp" ? "WhatsApp" : "Email"}.

Tom de conversa: ${tomConversa}
Categoria: ${categoria || "geral"}

Regras:
- Para WhatsApp: mensagens curtas, diretas, use emojis com moderação, máximo 500 caracteres
- Para Email: pode ser mais longo, estruturado, profissional
- Use variáveis como {{nome}}, {{empresa}} onde apropriado
- Não inclua saudação genérica como "Olá" sem a variável {{nome}}
${isEmail ? "- Gere também um assunto de email atrativo" : ""}

Responda APENAS com um JSON válido (sem markdown, sem \`\`\`):
{
  "nome": "Nome descritivo do template",
  ${isEmail ? '"assunto_email": "Assunto do email",' : ""}
  "corpo_texto": "Texto do template"
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return errJson("CONFIG_ERROR", "AI key not configured", corsHeaders);
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Gere um template de ${canal} para: ${objetivo}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      console.error("AI gateway error:", status, await aiResponse.text());
      if (status === 429) {
        return errJson("RATE_LIMITED", "Limite de requisições excedido, tente novamente em alguns segundos.", corsHeaders);
      }
      if (status === 402) {
        return errJson("PAYMENT_REQUIRED", "Créditos insuficientes para IA.", corsHeaders);
      }
      return errJson("AI_ERROR", "Erro ao gerar template com IA", corsHeaders);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return errJson("PARSE_ERROR", "Erro ao interpretar resposta da IA", corsHeaders);
    }

    return okJson({
      nome: parsed.nome || "Template gerado",
      assunto_email: parsed.assunto_email || null,
      corpo_texto: parsed.corpo_texto || "",
      canal,
      categoria: categoria || "geral",
    }, corsHeaders);

  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: e.message || "Erro interno" } }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
