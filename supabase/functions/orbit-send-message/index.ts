import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";

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

    const { conversa_id, mensagem, telefone, canal } = await req.json();

    if (!conversa_id || !mensagem) {
      return fail(ErrorCodes.VALIDATION_ERROR, "conversa_id e mensagem são obrigatórios");
    }

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

      const planResponse = fromPlanCheck(canUseResult);
      if (planResponse) return planResponse;
    }

    // Check if empresa is on demo plan
    let isDemo = false;
    if (profile?.empresa_id) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code, features)")
        .eq("empresa_id", profile.empresa_id)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      isDemo = planCode === "demo";
    }

    // ── Demo rate limit: 30 outbound messages per hour ──
    if (isDemo && profile?.empresa_id) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("orbit_mensagens")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", profile.empresa_id)
        .eq("direcao", "OUT")
        .gte("timestamp", oneHourAgo);

      if (count !== null && count >= 30) {
        return fail(
          ErrorCodes.DEMO_RATE_LIMIT,
          "Limite de 30 mensagens por hora atingido no modo demo.",
          429,
        );
      }
    }

    let messageStatus = "pendente";
    let providerId = null;

    if (isDemo) {
      messageStatus = "simulated";
    } else {
      let zapiQuery = supabase.from("orbit_zapi_config").select("*").eq("ativo", true);
      if (profile?.empresa_id) zapiQuery = zapiQuery.eq("empresa_id", profile.empresa_id);
      const { data: zapiConfig } = await zapiQuery.maybeSingle();

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
              body: JSON.stringify({ phone: telefone, message: mensagem }),
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
        empresa_id: profile?.empresa_id || null,
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

    return ok(
      { mensagem: novaMensagem, status: messageStatus },
      { simulated: isDemo },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-send-message] Erro:", message);
    return fail(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
});
