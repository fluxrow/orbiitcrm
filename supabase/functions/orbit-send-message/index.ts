import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";
import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";
import { signOrbitMediaUrl } from "../_shared/orbit-media.ts";
import { auditZapiSendAttempt } from "../_shared/zapi-audit.ts";
import { isAdapterEnabled, enqueueOutbox } from "../_shared/orbit-whatsapp-outbox.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claims?.user) {
      return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);
    }

    const body = await req.json();
    let { conversa_id, mensagem, telefone, canal, tipo_midia, url_midia, storage_path } = body;

    // Prefer storage_path; se ausente, usar url_midia (compat legado).
    const mediaSource: string | null = storage_path || url_midia || null;

    console.log("[orbit-send-message] Params recebidos:", JSON.stringify({ conversa_id, mensagem: mensagem?.substring(0, 30), telefone, canal, tipo_midia, hasStoragePath: !!storage_path, hasUrlMidia: !!url_midia }));

    if (!conversa_id || (!mensagem && !mediaSource)) {
      return fail(
        ErrorCodes.VALIDATION_ERROR,
        "conversa_id e mensagem/storage_path/url_midia são obrigatórios",
        400,
        undefined,
        req,
      );
    }

    const userId = claims.user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();

    console.log("[orbit-send-message] Profile:", JSON.stringify({ userId, empresa_id: profile?.empresa_id }));

    // ── Cross-tenant guard: conversa DEVE pertencer à empresa do usuário ──
    const { data: conversaRow, error: convErr } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, telefone_whatsapp")
      .eq("id", conversa_id)
      .maybeSingle();

    if (convErr || !conversaRow) {
      return fail(ErrorCodes.NOT_FOUND, "Conversa não encontrada", 404, undefined, req);
    }

    const conversaEmpresaId = conversaRow.empresa_id as string | null;

    // super_admin bypass
    const { data: superRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!superRow;

    if (!isSuperAdmin) {
      let allowed = profile?.empresa_id && conversaEmpresaId === profile.empresa_id;
      if (!allowed && conversaEmpresaId) {
        const { data: membership } = await supabase
          .from("user_empresa_memberships")
          .select("empresa_id")
          .eq("user_id", userId)
          .eq("empresa_id", conversaEmpresaId)
          .maybeSingle();
        allowed = !!membership;
      }
      if (!allowed) {
        console.warn("[orbit-send-message] cross-tenant blocked", { userId, conversa_id, conversaEmpresaId });
        return fail(ErrorCodes.UNAUTHORIZED, "Acesso negado à conversa", 403, undefined, req);
      }
    }

    // Se telefone não veio do frontend, usar o da conversa (já validada acima)
    if (!telefone) {
      telefone = conversaRow.telefone_whatsapp || null;
      console.log("[orbit-send-message] Telefone buscado da conversa:", telefone);
    }

    // ── Plan enforcement ──
    if (profile?.empresa_id) {
      const { data: canUseResult } = await supabase.rpc("saas_can_use", {
        p_empresa_id: profile.empresa_id,
        p_feature_code: "whatsapp_send",
        p_amount: 1,
      });

      const planResponse = fromPlanCheck(canUseResult, false, req);
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
          undefined,
          req,
        );
      }
    }

    let messageStatus = "pendente";
    let providerId = null;
    let failReason: string | null = null;

    // ── Adapter routing (Fase 3): manual + outbox_adapter_enabled=true → enfileira, sem Z-API ──
    if (!isDemo && profile?.empresa_id && await isAdapterEnabled(supabase, profile.empresa_id)) {
      const routed = await enqueueOutbox(supabase, {
        empresa_id: profile.empresa_id,
        conversa_id,
        source_type: "manual",
        source_id: crypto.randomUUID(),
        payload_type: (tipo_midia as any) || "text",
        payload: {
          mensagem: mensagem || "",
          url_midia: url_midia || null,
          storage_path: storage_path || null,
          tipo_midia: tipo_midia || null,
        },
      });
      // Registra a mensagem em orbit_mensagens como "queued" para UI acompanhar
      const { data: novaMensagem } = await supabase
        .from("orbit_mensagens")
        .insert({
          conversa_id,
          direcao: "OUT",
          mensagem: mensagem || (tipo_midia ? `📎 ${tipo_midia}` : ""),
          canal: canal || "whatsapp",
          status: "queued",
          empresa_id: conversaEmpresaId || profile.empresa_id,
          tipo_midia: tipo_midia || null,
          url_midia: url_midia || null,
          storage_path: storage_path || null,
        })
        .select()
        .single();
      return ok(
        {
          mensagem: novaMensagem,
          status: "queued",
          queued: !!routed.enqueued,
          outbox_id: routed.outbox_id ?? null,
          reason: routed.reason ?? null,
          adapter: true,
        },
        undefined,
        req,
      );
    }


    if (isDemo) {
      messageStatus = "simulated";
    } else {
      const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, profile?.empresa_id);

      console.log("[orbit-send-message] Z-API config:", JSON.stringify({
        found: !!zapiConfig,
        instance_id: zapiConfig?.instance_id ? "SET" : "EMPTY",
        token: zapiConfig?.token ? "SET" : "EMPTY",
        telefone: telefone || "EMPTY",
      }));

      const realSendBlock = getOrbitZapiRealSendBlockReason(zapiConfig);
      if (realSendBlock) {
        messageStatus = "falhou";
        failReason = realSendBlock;
        console.warn("[orbit-send-message] Envio real bloqueado:", { empresa_id: profile?.empresa_id, reason: realSendBlock });
        await auditZapiSendAttempt(supabase, {
          empresa_id: conversaEmpresaId || profile?.empresa_id || null,
          function_name: "orbit-send-message",
          action: "conversa_send",
          blocked: true,
          block_reason: "ZAPI_REAL_SEND_BLOCKED",
          zapi_config_id: zapiConfig?.id ?? null,
          conversa_id,
          created_by: userId,
          payload_summary: { canal: canal || "whatsapp", tipo_midia: tipo_midia || "text", telefone },
        });
      } else if (zapiConfig?.instance_id && zapiConfig?.token && telefone) {
        try {
          const zapiBase = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}`;
          const zapiHeaders = {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token || "",
          };

          let zapiUrl: string;
          let zapiBody: any;

          // Gerar signed URL para mídia do bucket privado orbit-media (TTL 1h)
          const mediaUrl = mediaSource
            ? await signOrbitMediaUrl(supabase, mediaSource, 3600)
            : null;

          // Choose endpoint based on media type
          if (tipo_midia === "image" && mediaUrl) {
            zapiUrl = `${zapiBase}/send-image`;
            zapiBody = { phone: telefone, image: mediaUrl, caption: mensagem || "" };
          } else if (tipo_midia === "audio" && mediaUrl) {
            zapiUrl = `${zapiBase}/send-audio`;
            zapiBody = { phone: telefone, audio: mediaUrl };
          } else if (tipo_midia === "document" && mediaUrl) {
            zapiUrl = `${zapiBase}/send-document`;
            const fileName = (mediaUrl as string).split("?")[0].split("/").pop() || "documento";
            zapiBody = { phone: telefone, document: mediaUrl, fileName };
          } else if (tipo_midia === "video" && mediaUrl) {
            zapiUrl = `${zapiBase}/send-video`;
            zapiBody = { phone: telefone, video: mediaUrl, caption: mensagem || "" };
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
        empresa_id: conversaEmpresaId || profile?.empresa_id || null,
        erro: failReason,
        tipo_midia: tipo_midia || null,
        url_midia: url_midia || null,
        storage_path: storage_path || null,
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
      req,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-send-message] Erro:", message);
    return fail(ErrorCodes.INTERNAL_ERROR, message, 500, undefined, req);
  }
});
