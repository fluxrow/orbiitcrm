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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verificar autenticação
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claims?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversa_id, mensagem, telefone, canal } = await req.json();

    if (!conversa_id || !mensagem) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get empresa_id from profile
    const userId = claims.user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();

    // ── Plan enforcement ──
    if (profile?.empresa_id) {
      const { data: canUseResult } = await supabase.rpc("saas_can_use", {
        p_empresa_id: profile.empresa_id,
        p_feature_code: "whatsapp_send",
        p_amount: 1,
      });

      if (canUseResult && canUseResult.allowed === false) {
        return new Response(
          JSON.stringify({ error: canUseResult.reason, code: canUseResult.reason }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if empresa is on demo plan
    let isDemo = false;
    if (profile?.empresa_id) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", profile.empresa_id)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      isDemo = planCode === "demo";
    }

    let messageStatus = "pendente";
    let providerId = null;

    if (isDemo) {
      messageStatus = "simulated";
    } else {
      // Buscar config Z-API
      const { data: zapiConfig } = await supabase
        .from("orbit_zapi_config")
        .select("*")
        .eq("ativo", true)
        .maybeSingle();

      if (zapiConfig?.instance_id && zapiConfig?.token && telefone) {
        try {
          const response = await fetch(
            `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Client-Token": zapiConfig.client_token || "",
              },
              body: JSON.stringify({
                phone: telefone,
                message: mensagem,
              }),
            }
          );

          const result = await response.json();
          messageStatus = response.ok ? "enviada" : "falhou";
          providerId = result.messageId;
        } catch (error) {
          console.error("[orbit-send-message] Erro Z-API:", error);
          messageStatus = "falhou";
        }
      }
    }

    // Salvar mensagem
    const { data: novaMensagem, error: msgError } = await supabase
      .from("orbit_mensagens")
      .insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: canal || "whatsapp",
        status: messageStatus,
        provider_message_id: providerId,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // ── Increment usage after successful save ──
    if (profile?.empresa_id && messageStatus !== "falhou") {
      await supabase.rpc("saas_increment_usage", {
        p_empresa_id: profile.empresa_id,
        p_feature_code: "whatsapp_send",
        p_amount: 1,
      });
    }

    // Atualizar conversa
    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: mensagem.substring(0, 100),
        mensagens_nao_lidas: 0,
      })
      .eq("id", conversa_id);

    return new Response(JSON.stringify({ ok: true, mensagem: novaMensagem, status: messageStatus, simulated: isDemo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-send-message] Erro:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
