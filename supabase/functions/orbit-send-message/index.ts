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

    const body = await req.json();
    let { conversa_id, mensagem, telefone, canal, tipo_midia, url_midia } = body;

    console.log("[orbit-send-message] Params recebidos:", JSON.stringify({ conversa_id, mensagem: mensagem?.substring(0, 30), telefone, canal, tipo_midia, url_midia: url_midia ? "SET" : "EMPTY" }));

    if (!conversa_id || (!mensagem && !url_midia)) {
      return fail(ErrorCodes.VALIDATION_ERROR, "conversa_id e mensagem/url_midia são obrigatórios");
    }

    // Se telefone não veio do frontend, buscar da conversa
    if (!telefone) {
      const { data: conversa } = await supabase
        .from("orbit_conversas")
        .select("telefone_whatsapp")
        .eq("id", conversa_id)
        .maybeSingle();
      telefone = conversa?.telefone_whatsapp || null;
      console.log("[orbit-send-message] Telefone buscado da conversa:", telefone);
    }

    const userId = claims.user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();

    console.log("[orbit-send-message] Profile:", JSON.stringify({ userId, empresa_id: profile?.empresa_id }));

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
    let failReason: string | null = null;

    if (isDemo) {
      messageStatus = "simulated";
    } else {
      let zapiQuery = supabase.from("orbit_zapi_config").select("*").eq("ativo", true);
      if (profile?.empresa_id) zapiQuery = zapiQuery.eq("empresa_id", profile.empresa_id);
      const { data: zapiConfig } = await zapiQuery.maybeSingle();

      console.log("[orbit-send-message] Z-API config:", JSON.stringify({
        found: !!zapiConfig,
        instance_id: zapiConfig?.instance_id ? "SET" : "EMPTY",
        token: zapiConfig?.token ? "SET" : "EMPTY",
        telefone: telefone || "EMPTY",
      }));

      if (zapiConfig?.instance_id && zapiConfig?.token && telefone) {
        try {
          const zapiBase = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}`;
          const zapiHeaders = {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token || "",
          };

          let zapiUrl: string;
          let zapiBody: any;

          // Choose endpoint based on media type
          if (tipo_midia === "image" && url_midia) {
            zapiUrl = `${zapiBase}/send-image`;
            zapiBody = { phone: telefone, image: url_midia, caption: mensagem || "" };
          } else if (tipo_midia === "audio" && url_midia) {
            zapiUrl = `${zapiBase}/send-audio`;
            zapiBody = { phone: telefone, audio: url_midia };
          } else if (tipo_midia === "document" && url_midia) {
            zapiUrl = `${zapiBase}/send-document`;
            const fileName = url_midia.split("/").pop() || "documento";
            zapiBody = { phone: telefone, document: url_midia, fileName };
          } else if (tipo_midia === "video" && url_midia) {
            zapiUrl = `${zapiBase}/send-video`;
            zapiBody = { phone: telefone, video: url_midia, caption: mensagem || "" };
          } else {
            // Default: text
            zapiUrl = `${zapiBase}/send-text`;
            zapiBody = { phone: telefone, message: mensagem };
          }

          console.log("[orbit-send-message] Enviando via Z-API para:", telefone, "tipo:", tipo_midia || "text");

          const response = await fetch(zapiUrl, {
            method: "POST",
            headers: zapiHeaders,
            body: JSON.stringify(zapiBody),
          });

          const result = await response.json();
          console.log("[orbit-send-message] Z-API response:", JSON.stringify({ ok: response.ok, status: response.status, messageId: result.messageId }));

          messageStatus = response.ok ? "enviada" : "falhou";
          providerId = result.messageId;
          if (!response.ok) failReason = `Z-API ${response.status}: ${JSON.stringify(result)}`;
        } catch (error) {
          console.error("[orbit-send-message] Erro Z-API:", error);
          messageStatus = "falhou";
          failReason = `Z-API exception: ${error instanceof Error ? error.message : String(error)}`;
        }
      } else {
        messageStatus = "falhou";
        const missing: string[] = [];
        if (!zapiConfig?.instance_id) missing.push("instance_id");
        if (!zapiConfig?.token) missing.push("token");
        if (!telefone) missing.push("telefone");
        failReason = `Faltando: ${missing.join(", ")}`;
        console.warn("[orbit-send-message] Envio impossível:", failReason);
      }
    }

    // Salvar mensagem
    const { data: novaMensagem, error: msgError } = await supabase
      .from("orbit_mensagens")
      .insert({
        conversa_id,
        direcao: "OUT",
        mensagem: mensagem || (tipo_midia ? `📎 ${tipo_midia}` : ""),
        canal: canal || "whatsapp",
        status: messageStatus,
        provider_message_id: providerId,
        empresa_id: profile?.empresa_id || null,
        erro: failReason,
        tipo_midia: tipo_midia || null,
        url_midia: url_midia || null,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    console.log("[orbit-send-message] Mensagem salva:", JSON.stringify({ id: novaMensagem.id, status: messageStatus }));

    // ── Increment usage after successful save ──
    if (profile?.empresa_id && messageStatus !== "falhou") {
      await supabase.rpc("saas_increment_usage", {
        p_empresa_id: profile.empresa_id,
        p_feature_code: "whatsapp_send",
        p_amount: 1,
      });
    }

    // Atualizar conversa
    const previewText = tipo_midia
      ? (mensagem || `📎 ${tipo_midia}`).substring(0, 100)
      : (mensagem || "").substring(0, 100);

    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: previewText,
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
