import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse event type from query params
    const url = new URL(req.url);
    const eventType = url.searchParams.get("event") || "on-receive";

    const payload = await req.json();
    console.log(`[orbit-webhook] Evento: ${eventType}, Payload:`, JSON.stringify(payload));

    // Handle different event types
    switch (eventType) {
      case "on-connect":
        console.log("[orbit-webhook] Instância conectada");
        return new Response(JSON.stringify({ ok: true, event: "on-connect" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "on-disconnect":
        console.log("[orbit-webhook] Instância desconectada");
        return new Response(JSON.stringify({ ok: true, event: "on-disconnect" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "presence":
        console.log("[orbit-webhook] Atualização de presença:", payload.status);
        return new Response(JSON.stringify({ ok: true, event: "presence", status: payload.status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "message-status":
        // Update message status in database
        if (payload.messageId) {
          await supabase
            .from("orbit_mensagens")
            .update({ status: payload.status || "delivered" })
            .eq("provider_message_id", payload.messageId);
        }
        return new Response(JSON.stringify({ ok: true, event: "message-status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "on-send":
        // Get config to check if should process own messages
        const { data: zapiConfig } = await supabase
          .from("orbit_zapi_config")
          .select("notificar_enviadas_por_mim")
          .maybeSingle();

        if (!zapiConfig?.notificar_enviadas_por_mim) {
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "own messages disabled" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Process as sent message - fall through to on-receive logic with fromMe flag
        break;

      case "on-receive":
      default:
        // Process incoming message - continue with main logic below
        break;
    }

    // Main message processing logic (for on-receive and on-send events)
    const phone = payload.phone?.replace(/\D/g, "") || payload.from?.replace(/\D/g, "");
    const messageText = payload.text?.message || payload.body || payload.caption || "";
    const messageId = payload.messageId || payload.id;
    const fromMe = payload.fromMe || eventType === "on-send";

    // Skip messages sent by us (unless it's on-send event with notificar enabled)
    if (!phone || (fromMe && eventType !== "on-send")) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize phone (Brazilian format)
    const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;

    // 1. Find or create prospect
    let { data: prospect } = await supabase
      .from("orbit_prospects")
      .select("*")
      .eq("telefone_whatsapp", normalizedPhone)
      .maybeSingle();

    if (!prospect) {
      const { data: newProspect, error: prospectError } = await supabase
        .from("orbit_prospects")
        .insert({
          nome_razao: `WhatsApp ${normalizedPhone}`,
          telefone_whatsapp: normalizedPhone,
          origem_contato: "PROSPECTS",
          status_qualificacao: "novo",
        })
        .select()
        .single();

      if (prospectError) {
        console.error("[orbit-webhook] Erro ao criar prospect:", prospectError);
        throw prospectError;
      }
      prospect = newProspect;
    }

    // 2. Find or create conversation
    let { data: conversa } = await supabase
      .from("orbit_conversas")
      .select("*")
      .eq("telefone_whatsapp", normalizedPhone)
      .eq("canal", "whatsapp")
      .eq("status", "aberta")
      .maybeSingle();

    if (!conversa) {
      const { data: newConversa, error: conversaError } = await supabase
        .from("orbit_conversas")
        .insert({
          prospect_id: prospect.id,
          telefone_whatsapp: normalizedPhone,
          canal: "whatsapp",
          status: "aberta",
          human_talk: false,
          mensagens_nao_lidas: 0,
        })
        .select()
        .single();

      if (conversaError) {
        console.error("[orbit-webhook] Erro ao criar conversa:", conversaError);
        throw conversaError;
      }
      conversa = newConversa;
    }

    // 3. Check for duplicate message
    if (messageId) {
      const { data: existingMsg } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("provider_message_id", messageId)
        .maybeSingle();

      if (existingMsg) {
        console.log("[orbit-webhook] Mensagem duplicada ignorada:", messageId);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4. Save message
    const direcao = fromMe ? "OUT" : "IN";
    await supabase.from("orbit_mensagens").insert({
      conversa_id: conversa.id,
      direcao,
      mensagem: messageText,
      provider_message_id: messageId,
      canal: "whatsapp",
      status: fromMe ? "enviada" : "recebida",
    });

    // 5. Update conversation
    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: messageText.substring(0, 100),
        mensagens_nao_lidas: fromMe ? 0 : (conversa.mensagens_nao_lidas || 0) + 1,
      })
      .eq("id", conversa.id);

    // 6. If AI active and human_talk = false and incoming message, call AI agent
    if (!fromMe && !conversa.human_talk) {
      const { data: aiConfig } = await supabase
        .from("orbit_ai_config")
        .select("*")
        .maybeSingle();

      if (aiConfig?.modo_automatico) {
        // Call AI edge function (fire and forget via fetch)
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            conversa_id: conversa.id,
            prospect_id: prospect.id,
            mensagem: messageText,
            telefone: normalizedPhone,
          }),
        }).catch(err => console.error("[orbit-webhook] Erro ao chamar AI agent:", err));
      }
    }

    return new Response(JSON.stringify({ ok: true, event: eventType, prospect_id: prospect.id, conversa_id: conversa.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-webhook] Erro:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
