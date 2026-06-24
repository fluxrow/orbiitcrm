import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * Generate phone number variants for flexible matching.
 * Given a normalized BR phone like 5551999887766 (13 digits with 9),
 * also generate variant without the 9: 555199887766 (12 digits).
 * And vice-versa: given 555199887766 (12 digits), add the 9: 5551999887766.
 */
function generatePhoneVariants(normalizedPhone: string): string[] {
  const variants = new Set<string>();
  variants.add(normalizedPhone);

  // Only apply to Brazilian numbers (starting with 55)
  if (normalizedPhone.startsWith("55")) {
    const withoutCountry = normalizedPhone.substring(2); // e.g. 51999887766

    if (withoutCountry.length === 11) {
      // Has 9th digit (DDD 2 digits + 9 + 8 digits) — create variant without it
      const ddd = withoutCountry.substring(0, 2);
      const ninthDigit = withoutCountry.charAt(2);
      if (ninthDigit === "9") {
        const without9 = `55${ddd}${withoutCountry.substring(3)}`;
        variants.add(without9);
      }
    } else if (withoutCountry.length === 10) {
      // Missing 9th digit (DDD 2 digits + 8 digits) — create variant with it
      const ddd = withoutCountry.substring(0, 2);
      const with9 = `55${ddd}9${withoutCountry.substring(2)}`;
      variants.add(with9);
    }
  }

  return Array.from(variants);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Optional shared-secret authentication. When ORBIT_WEBHOOK_SECRET is
  // configured, callers (Z-API) must include header `x-webhook-secret` with
  // the matching value. Constant-time comparison to avoid timing attacks.
  const webhookSecret = Deno.env.get("ORBIT_WEBHOOK_SECRET");
  if (webhookSecret) {
    const provided = req.headers.get("x-webhook-secret") || "";
    const a = new TextEncoder().encode(provided);
    const b = new TextEncoder().encode(webhookSecret);
    let ok = a.length === b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) ok = false;
    }
    if (!ok) {
      console.warn("[orbit-webhook] Invalid webhook secret");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let logId: string | null = null;

  try {
    const url = new URL(req.url);
    const eventType = url.searchParams.get("event") || "on-receive";

    const payload = await req.json();
    // Basic input validation
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const _rawText = JSON.stringify(payload);
    if (_rawText.length > 200_000) {
      return new Response(JSON.stringify({ error: "payload_too_large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[orbit-webhook] Evento: ${eventType}, Payload:`, _rawText);



    const payloadInstanceId = payload.instanceId || null;
    const payloadPhone = payload.phone?.replace(/\D/g, "") || payload.from?.replace(/\D/g, "") || null;
    const payloadType = payload.type as string | undefined;

    // Z-API status callbacks que NUNCA representam mensagem nova de conteúdo
    const STATUS_ONLY_CALLBACKS = new Set([
      "ConnectedCallback",
      "DisconnectedCallback",
      "PresenceChatCallback",
      "MessageStatusCallback",
      "DeliveryCallback",
      "ChatPresenceCallback",
      "NotificationCallback",
    ]);

    if (payloadType && STATUS_ONLY_CALLBACKS.has(payloadType) && eventType !== "message-status" && eventType !== "presence" && eventType !== "on-connect" && eventType !== "on-disconnect") {
      console.log(`[orbit-webhook] Ignorando callback de status: ${payloadType}`);
      const { data: logRow } = await supabase
        .from("orbit_webhook_logs")
        .insert({
          event_type: eventType,
          instance_id: payloadInstanceId,
          phone: payloadPhone,
          payload,
          status: "ignored",
          error_message: `status_callback:${payloadType}`,
        })
        .select("id")
        .single();
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "status_callback", type: payloadType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: logRow } = await supabase
      .from("orbit_webhook_logs")
      .insert({
        event_type: eventType,
        instance_id: payloadInstanceId,
        phone: payloadPhone,
        payload,
        status: "received",
      })
      .select("id")
      .single();
    logId = logRow?.id || null;

    switch (eventType) {
      case "on-connect":
        console.log("[orbit-webhook] Instância conectada");
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: "on-connect" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "on-disconnect":
        console.log("[orbit-webhook] Instância desconectada");
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: "on-disconnect" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "presence":
        console.log("[orbit-webhook] Atualização de presença:", payload.status);
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: "presence", status: payload.status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "message-status":
        if (payload.messageId) {
          await supabase
            .from("orbit_mensagens")
            .update({ status: payload.status || "delivered" })
            .eq("provider_message_id", payload.messageId);
        }
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: "message-status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "on-send":
      case "on-receive":
      default:
        break;
    }

    // ── Resolve empresa_id from Z-API config ──
    let empresaId: string | null = null;

    if (payloadInstanceId) {
      const { data: zapiByInstance } = await supabase
        .from("orbit_zapi_config")
        .select("empresa_id")
        .eq("instance_id", payloadInstanceId)
        .maybeSingle();
      empresaId = zapiByInstance?.empresa_id || null;
    }

    if (!empresaId) {
      const { data: zapiActive } = await supabase
        .from("orbit_zapi_config")
        .select("empresa_id, notificar_enviadas_por_mim")
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      empresaId = zapiActive?.empresa_id || null;

      if (eventType === "on-send" && !zapiActive?.notificar_enviadas_por_mim) {
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "own messages disabled" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "own messages disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (eventType === "on-send") {
      const { data: zapiCfg } = await supabase
        .from("orbit_zapi_config")
        .select("notificar_enviadas_por_mim")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (!zapiCfg?.notificar_enviadas_por_mim) {
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "own messages disabled" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "own messages disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("[orbit-webhook] Resolved empresa_id:", empresaId);

    // Main message processing
    const phone = payload.phone?.replace(/\D/g, "") || payload.from?.replace(/\D/g, "");
    const fromMe = payload.fromMe || eventType === "on-send";

    // ── Extract media from Z-API payload ──
    let tipoMidia: string | null = null;
    let urlMidia: string | null = null;
    let messageText = payload.text?.message || payload.body || "";

    if (payload.image) {
      tipoMidia = "image";
      urlMidia = payload.image.imageUrl || payload.image.url || null;
      messageText = payload.image.caption || messageText || "";
    } else if (payload.audio) {
      tipoMidia = "audio";
      urlMidia = payload.audio.audioUrl || payload.audio.url || null;
    } else if (payload.video) {
      tipoMidia = "video";
      urlMidia = payload.video.videoUrl || payload.video.url || null;
      messageText = payload.video.caption || messageText || "";
    } else if (payload.document) {
      tipoMidia = "document";
      urlMidia = payload.document.documentUrl || payload.document.url || null;
      messageText = payload.document.caption || payload.document.fileName || messageText || "";
    } else if (payload.sticker) {
      tipoMidia = "image";
      urlMidia = payload.sticker.stickerUrl || payload.sticker.url || null;
    }

    // Fallback: caption at root level
    if (!messageText && payload.caption) {
      messageText = payload.caption;
    }

    const messageId = payload.messageId || payload.id;

    // Defesa em profundidade: sem conteúdo, sem mídia e sem messageId → não é mensagem
    if (!messageText && !tipoMidia && !messageId) {
      console.log("[orbit-webhook] Payload sem conteúdo/mídia/messageId — ignorando (provável status callback)");
      if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "empty_payload" }).eq("id", logId);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "empty_payload" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!phone || (fromMe && eventType !== "on-send")) {
      if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "no phone or skipped fromMe" }).eq("id", logId);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;

    // Generate phone variants for matching (with/without 9th digit)
    const phoneVariants = generatePhoneVariants(normalizedPhone);
    console.log("[orbit-webhook] Phone variants para busca:", phoneVariants);

    // 1. Find or create prospect — search all phone variants
    const orFilter = phoneVariants
      .map(v => `whatsapp.eq.${v},telefone.eq.${v}`)
      .join(",");

    let prospectQuery = supabase
      .from("orbit_prospects")
      .select("*")
      .or(orFilter);
    if (empresaId) prospectQuery = prospectQuery.eq("empresa_id", empresaId);

    let { data: prospect } = await prospectQuery.maybeSingle();

    if (prospect && !prospect.whatsapp) {
      console.log("[orbit-webhook] Auto-preenchendo whatsapp para prospect:", prospect.id);
      await supabase
        .from("orbit_prospects")
        .update({ whatsapp: normalizedPhone, whatsapp_status: "nao_verificado" })
        .eq("id", prospect.id);
      prospect.whatsapp = normalizedPhone;
    }

    if (!prospect) {
      if (empresaId) {
        const { data: saasEmpresa } = await supabase
          .from("saas_empresa")
          .select("plan_id, plan:saas_plans(code, limits)")
          .eq("empresa_id", empresaId)
          .maybeSingle();
        const planLimits = (saasEmpresa?.plan as any)?.limits;
        const maxProspects = planLimits?.max_prospects;

        if (maxProspects) {
          const { count } = await supabase
            .from("orbit_prospects")
            .select("*", { count: "exact", head: true })
            .eq("empresa_id", empresaId);

          if (count !== null && count >= maxProspects) {
            console.log("[orbit-webhook] Prospect limit reached for empresa:", empresaId);
            if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "prospect_limit_reached" }).eq("id", logId);
            return new Response(JSON.stringify({ ok: true, skipped: true, reason: "prospect_limit_reached" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      const insertData: any = {
        nome_razao: `WhatsApp ${normalizedPhone}`,
        telefone: normalizedPhone,
        whatsapp: normalizedPhone,
        whatsapp_status: "nao_verificado",
        origem_contato: "PROSPECTS",
        status_qualificacao: "novo",
      };
      if (empresaId) insertData.empresa_id = empresaId;

      const { data: newProspect, error: prospectError } = await supabase
        .from("orbit_prospects")
        .insert(insertData)
        .select()
        .single();

      if (prospectError) {
        if (prospectError.code === "23505") {
          console.log("[orbit-webhook] Prospect duplicado, buscando por variantes de telefone");
          const fallbackOrFilter = phoneVariants
            .map(v => `whatsapp.eq.${v},telefone.eq.${v}`)
            .join(",");
          const { data: existingProspect } = await supabase
            .from("orbit_prospects")
            .select("*")
            .or(fallbackOrFilter)
            .maybeSingle();

          if (existingProspect) {
            if (!existingProspect.empresa_id && empresaId) {
              await supabase
                .from("orbit_prospects")
                .update({ empresa_id: empresaId })
                .eq("id", existingProspect.id);
              existingProspect.empresa_id = empresaId;
            }
            if (!existingProspect.whatsapp) {
              console.log("[orbit-webhook] Auto-preenchendo whatsapp (fallback) para prospect:", existingProspect.id);
              await supabase
                .from("orbit_prospects")
                .update({ whatsapp: normalizedPhone, whatsapp_status: "nao_verificado" })
                .eq("id", existingProspect.id);
              existingProspect.whatsapp = normalizedPhone;
            }
            prospect = existingProspect;
          } else {
            console.error("[orbit-webhook] Prospect duplicado mas não encontrado com OR:", normalizedPhone);
            if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "duplicate_unresolved" }).eq("id", logId);
            return new Response(JSON.stringify({ ok: true, ignored: true, reason: "duplicate_unresolved" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          console.error("[orbit-webhook] Erro ao criar prospect:", prospectError);
          throw prospectError;
        }
      } else {
        prospect = newProspect;
      }
    }

    // 2. Find or create conversation — match by prospect + phone variants
    // para evitar duplicar quando entrada/saída usam formatos diferentes (com/sem 9)
    let conversaQuery = supabase
      .from("orbit_conversas")
      .select("*")
      .eq("prospect_id", prospect.id)
      .eq("canal", "whatsapp")
      .eq("status", "aberta")
      .order("ultima_mensagem_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (empresaId) conversaQuery = conversaQuery.eq("empresa_id", empresaId);

    let { data: conversaRows } = await conversaQuery;
    let conversa = conversaRows?.[0] || null;

    if (!conversa) {
      let altQuery = supabase
        .from("orbit_conversas")
        .select("*")
        .in("telefone_whatsapp", phoneVariants)
        .eq("canal", "whatsapp")
        .eq("status", "aberta")
        .order("ultima_mensagem_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (empresaId) altQuery = altQuery.eq("empresa_id", empresaId);
      const { data: altRows } = await altQuery;
      conversa = altRows?.[0] || null;
    }

    if (conversa && conversa.telefone_whatsapp !== normalizedPhone) {
      await supabase
        .from("orbit_conversas")
        .update({ telefone_whatsapp: normalizedPhone })
        .eq("id", conversa.id);
      conversa.telefone_whatsapp = normalizedPhone;
    }

    if (!conversa) {
      const insertConversa: any = {
        prospect_id: prospect.id,
        telefone_whatsapp: normalizedPhone,
        canal: "whatsapp",
        status: "aberta",
        human_talk: false,
        mensagens_nao_lidas: 0,
      };
      if (empresaId) insertConversa.empresa_id = empresaId;

      const { data: newConversa, error: conversaError } = await supabase
        .from("orbit_conversas")
        .insert(insertConversa)
        .select()
        .single();

      if (conversaError) {
        console.error("[orbit-webhook] Erro ao criar conversa:", conversaError);
        throw conversaError;
      }
      conversa = newConversa;
    }

    // 3. Duplicate check
    if (messageId) {
      const { data: existingMsg } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("provider_message_id", messageId)
        .maybeSingle();

      if (existingMsg) {
        console.log("[orbit-webhook] Mensagem duplicada ignorada:", messageId);
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "duplicate_message" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4. Save message with media fields
    const direcao = fromMe ? "OUT" : "IN";
    const previewText = tipoMidia
      ? (messageText || `📎 ${tipoMidia}`).substring(0, 100)
      : messageText.substring(0, 100);

    await supabase.from("orbit_mensagens").insert({
      conversa_id: conversa.id,
      direcao,
      mensagem: messageText || (tipoMidia ? `📎 ${tipoMidia}` : ""),
      provider_message_id: messageId,
      canal: "whatsapp",
      status: fromMe ? "enviada" : "recebida",
      empresa_id: empresaId,
      tipo_midia: tipoMidia,
      url_midia: urlMidia,
    });

    // 4b. Email-CTA attribution: if this is an inbound message and the prospect
    // recently clicked an email CTA (last 14 days), record a one-time attribution event.
    if (!fromMe && empresaId && prospect?.id) {
      try {
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: ctaClick } = await supabase
          .from("orbit_campaign_recipients")
          .select("campaign_id, clicked_at")
          .eq("empresa_id", empresaId)
          .eq("prospect_id", prospect.id)
          .not("clicked_at", "is", null)
          .gte("clicked_at", since)
          .order("clicked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ctaClick?.campaign_id) {
          const { data: alreadyLogged } = await supabase
            .from("prospect_events")
            .select("id")
            .eq("prospect_id", prospect.id)
            .eq("event_type", "email_cta_whatsapp_reply")
            .contains("metadata", { campaign_id: ctaClick.campaign_id })
            .maybeSingle();

          if (!alreadyLogged) {
            await supabase.from("prospect_events").insert({
              empresa_id: empresaId,
              prospect_id: prospect.id,
              event_type: "email_cta_whatsapp_reply",
              titulo: "Resposta via CTA de email",
              descricao: "Lead respondeu no WhatsApp após clicar no botão do email",
              metadata: { campaign_id: ctaClick.campaign_id, clicked_at: ctaClick.clicked_at },
            });
            console.log("[orbit-webhook] CTA attribution registered for prospect", prospect.id);
          }
        }
      } catch (attrErr) {
        console.warn("[orbit-webhook] CTA attribution skipped:", attrErr);
      }
    }


    // 5. Update conversation
    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: previewText,
        mensagens_nao_lidas: fromMe ? 0 : (conversa.mensagens_nao_lidas || 0) + 1,
      })
      .eq("id", conversa.id);

    // 6. If AI active and human_talk = false and incoming message, call AI agent
    if (!fromMe && !conversa.human_talk) {
      // Atomic lock: só dispara AI se conseguir adquirir o lock
      const { data: lockResult } = await supabase
        .from("orbit_conversas")
        .update({ ai_processing: true })
        .eq("id", conversa.id)
        .eq("ai_processing", false)
        .select("id");

      if (lockResult && lockResult.length > 0) {
        // Lock adquirido — disparar agente
        let aiConfigQuery = supabase.from("orbit_ai_config").select("*");
        if (empresaId) aiConfigQuery = aiConfigQuery.eq("empresa_id", empresaId);
        const { data: aiConfig } = await aiConfigQuery.maybeSingle();

        if (aiConfig?.modo_automatico) {
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
            },
            body: JSON.stringify({
              conversa_id: conversa.id,
              prospect_id: prospect.id,
              mensagem: messageText,
              telefone: normalizedPhone,
            }),
          }).catch(err => console.error("[orbit-webhook] Erro ao chamar AI agent:", err));
        } else {
          // Liberar lock se não vai chamar IA
          await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", conversa.id);
        }
      } else {
        console.log("[orbit-webhook] AI já processando conversa, msg será agregada:", conversa.id);
      }
    }

    if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);

    return new Response(JSON.stringify({ ok: true, event: eventType, prospect_id: prospect.id, conversa_id: conversa.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-webhook] Erro:", message);
    if (logId) await supabase.from("orbit_webhook_logs").update({ status: "failed", error_message: message }).eq("id", logId).catch(() => {});
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

});
