import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    console.log(`[orbit-webhook] Evento: ${eventType}, Payload:`, JSON.stringify(payload));

    const payloadInstanceId = payload.instanceId || null;
    const payloadPhone = payload.phone?.replace(/\D/g, "") || payload.from?.replace(/\D/g, "") || null;

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

    // 2. Find or create conversation
    let conversaQuery = supabase
      .from("orbit_conversas")
      .select("*")
      .eq("telefone_whatsapp", normalizedPhone)
      .eq("canal", "whatsapp")
      .eq("status", "aberta");
    if (empresaId) conversaQuery = conversaQuery.eq("empresa_id", empresaId);

    let { data: conversa } = await conversaQuery.maybeSingle();

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
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
