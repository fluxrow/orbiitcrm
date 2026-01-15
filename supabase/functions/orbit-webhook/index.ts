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

    const payload = await req.json();
    console.log("[orbit-webhook] Payload recebido:", JSON.stringify(payload));

    // Extrair dados da mensagem (formato Z-API)
    const phone = payload.phone?.replace(/\D/g, "") || payload.from?.replace(/\D/g, "");
    const messageText = payload.text?.message || payload.body || payload.caption || "";
    const messageId = payload.messageId || payload.id;
    const fromMe = payload.fromMe || false;

    if (!phone || fromMe) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalizar telefone (formato brasileiro)
    const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;

    // 1. Buscar ou criar prospect
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

    // 2. Buscar ou criar conversa
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

    // 3. Verificar duplicata de mensagem
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

    // 4. Salvar mensagem
    await supabase.from("orbit_mensagens").insert({
      conversa_id: conversa.id,
      direcao: "IN",
      mensagem: messageText,
      provider_message_id: messageId,
      canal: "whatsapp",
      status: "recebida",
    });

    // 5. Atualizar conversa
    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: messageText.substring(0, 100),
        mensagens_nao_lidas: (conversa.mensagens_nao_lidas || 0) + 1,
      })
      .eq("id", conversa.id);

    // 6. Se IA ativa e human_talk = false, chamar agente IA
    if (!conversa.human_talk) {
      const { data: aiConfig } = await supabase
        .from("orbit_ai_config")
        .select("*")
        .maybeSingle();

      if (aiConfig?.modo_automatico) {
        // Chamar edge function de IA (fire and forget via fetch)
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

    return new Response(JSON.stringify({ ok: true, prospect_id: prospect.id, conversa_id: conversa.id }), {
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
