import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MetaMessageRequest {
  conversa_id: string;
  mensagem: string;
  empresa_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { conversa_id, mensagem, empresa_id }: MetaMessageRequest = await req.json();

    if (!conversa_id || !mensagem || !empresa_id) {
      return new Response(
        JSON.stringify({ error: "conversa_id, mensagem e empresa_id são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar conversa
    const { data: conversa } = await supabase
      .from("orbit_conversas")
      .select("*, prospect:orbit_prospects(*)")
      .eq("id", conversa_id)
      .single();

    if (!conversa) {
      return new Response(
        JSON.stringify({ error: "Conversa não encontrada" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── Plan enforcement ──
    const featureCode = conversa.canal === "instagram" ? "ig_send" : "fb_send";
    const { data: canUseResult } = await supabase.rpc("saas_can_use", {
      p_empresa_id: empresa_id,
      p_feature_code: featureCode,
      p_amount: 1,
    });

    if (canUseResult && canUseResult.allowed === false) {
      return new Response(
        JSON.stringify({ error: canUseResult.reason, code: canUseResult.reason }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar config Meta
    const { data: metaConfig } = await supabase
      .from("orbit_meta_config")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("ativo", true)
      .maybeSingle();

    if (!metaConfig || !metaConfig.access_token) {
      return new Response(
        JSON.stringify({ error: "Meta não configurado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const recipientId = conversa.telefone_whatsapp;
    
    if (!recipientId) {
      return new Response(
        JSON.stringify({ error: "ID do destinatário não encontrado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const pageId = conversa.canal === "instagram" 
      ? metaConfig.instagram_business_id 
      : metaConfig.facebook_page_id;

    if (!pageId) {
      return new Response(
        JSON.stringify({ error: `${conversa.canal} não configurado` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${metaConfig.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: mensagem },
          messaging_type: "RESPONSE",
        }),
      }
    );

    const result = await metaRes.json();

    if (!metaRes.ok) {
      console.error("[send-orbit-meta-message] Erro Meta:", result);
      return new Response(
        JSON.stringify({ error: result.error?.message || "Erro ao enviar mensagem" }),
        { status: metaRes.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Salvar mensagem no banco
    await supabase
      .from("orbit_mensagens")
      .insert({
        empresa_id,
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: conversa.canal,
        provider_message_id: result.message_id,
        status: "enviada",
      });

    // ── Increment usage after successful send ──
    await supabase.rpc("saas_increment_usage", {
      p_empresa_id: empresa_id,
      p_feature_code: featureCode,
      p_amount: 1,
    });

    // Atualizar conversa
    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: mensagem.substring(0, 100),
      })
      .eq("id", conversa_id);

    return new Response(
      JSON.stringify({ success: true, message_id: result.message_id }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[send-orbit-meta-message] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
