import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  const url = new URL(req.url);
  
  // Webhook verification (GET request from Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe") {
      // Verificar token - buscar na config da empresa
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config } = await supabase
        .from("orbit_meta_config")
        .select("*")
        .eq("webhook_verify_token", token)
        .maybeSingle();

      if (config) {
        console.log("[orbit-meta-webhook] Webhook verified for empresa:", config.empresa_id);
        return new Response(challenge, { status: 200 });
      }
    }

    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Verify Meta x-hub-signature-256 (HMAC-SHA256 of raw body using META_APP_SECRET) ──
    const appSecret = Deno.env.get("META_APP_SECRET");
    const rawBody = await req.text();

    if (!appSecret) {
      console.error("[orbit-meta-webhook] META_APP_SECRET not configured — rejecting");
      return new Response("Server not configured", { status: 503, headers: corsHeaders });
    }

    const sigHeader = req.headers.get("x-hub-signature-256") || "";
    if (!sigHeader.startsWith("sha256=")) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    const provided = sigHeader.slice("sha256=".length);

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
    const expected = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    // constant-time-ish comparison
    if (provided.length !== expected.length) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const body = JSON.parse(rawBody);
    console.log("[orbit-meta-webhook] Verified signature, processing event");

    // Processar eventos do Meta
    if (body.object === "instagram" || body.object === "page") {
      for (const entry of body.entry || []) {
        const pageId = entry.id;
        
        // Buscar empresa por page_id ou instagram_business_id
        const { data: config } = await supabase
          .from("orbit_meta_config")
          .select("*")
          .or(`facebook_page_id.eq.${pageId},instagram_business_id.eq.${pageId}`)
          .maybeSingle();

        if (!config) {
          console.log("[orbit-meta-webhook] Config not found for page:", pageId);
          continue;
        }

        const empresa_id = config.empresa_id;
        const canal = body.object === "instagram" ? "instagram" : "facebook";

        // Processar mensagens
        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const message = messaging.message;

          if (!senderId || !message) continue;

          // Buscar ou criar prospect
          let { data: prospect } = await supabase
            .from("orbit_prospects")
            .select("*")
            .eq("empresa_id", empresa_id)
            .or(`cnpj_cpf.eq.${senderId},observacoes.ilike.%${senderId}%`)
            .maybeSingle();

          if (!prospect) {
            // Criar prospect com ID do Meta
            const { data: newProspect } = await supabase
              .from("orbit_prospects")
              .insert({
                empresa_id,
                nome_razao: `Usuário ${canal} ${senderId.slice(-4)}`,
                origem_contato: canal.toUpperCase(),
                status_qualificacao: "novo",
                observacoes: `Meta ID: ${senderId}`,
              })
              .select()
              .single();
            
            prospect = newProspect;
          }

          if (!prospect) continue;

          // Buscar ou criar conversa
          let { data: conversa } = await supabase
            .from("orbit_conversas")
            .select("*")
            .eq("prospect_id", prospect.id)
            .eq("canal", canal)
            .maybeSingle();

          if (!conversa) {
            const { data: newConversa } = await supabase
              .from("orbit_conversas")
              .insert({
                empresa_id,
                prospect_id: prospect.id,
                telefone_whatsapp: senderId, // Usar o sender ID
                canal,
                status: "aberta",
              })
              .select()
              .single();

            conversa = newConversa;
          }

          if (!conversa) continue;

          // Salvar mensagem
          const texto = message.text || message.attachments?.[0]?.payload?.url || "[Mídia]";
          
          await supabase
            .from("orbit_mensagens")
            .insert({
              empresa_id,
              conversa_id: conversa.id,
              direcao: "IN",
              mensagem: texto,
              canal,
              provider_message_id: message.mid,
              tipo_midia: message.attachments ? message.attachments[0]?.type || "text" : "text",
              url_midia: message.attachments?.[0]?.payload?.url,
            });

          // Atualizar conversa
          await supabase
            .from("orbit_conversas")
            .update({
              ultima_mensagem_at: new Date().toISOString(),
              ultima_mensagem_preview: texto.substring(0, 100),
              mensagens_nao_lidas: (conversa.mensagens_nao_lidas || 0) + 1,
            })
            .eq("id", conversa.id);

          console.log("[orbit-meta-webhook] Message saved from", senderId);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[orbit-meta-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
