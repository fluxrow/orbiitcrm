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

    const url = new URL(req.url);
    const eventType = url.searchParams.get("event") || "on-receive";

    const payload = await req.json();
    console.log(`[orbit-webhook] Evento: ${eventType}, Payload:`, JSON.stringify(payload));

    // Handle non-message events
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
      case "on-receive":
      default:
        break;
    }

    // ── Resolve empresa_id from Z-API config ──
    // Try matching by instance_id from the payload, or fall back to first active config
    let empresaId: string | null = null;
    const payloadInstanceId = payload.instanceId || null;

    if (payloadInstanceId) {
      const { data: zapiByInstance } = await supabase
        .from("orbit_zapi_config")
        .select("empresa_id")
        .eq("instance_id", payloadInstanceId)
        .maybeSingle();
      empresaId = zapiByInstance?.empresa_id || null;
    }

    if (!empresaId) {
      // Fallback: get the first active Z-API config
      const { data: zapiActive } = await supabase
        .from("orbit_zapi_config")
        .select("empresa_id, notificar_enviadas_por_mim")
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      empresaId = zapiActive?.empresa_id || null;

      // Handle on-send notification check
      if (eventType === "on-send" && !zapiActive?.notificar_enviadas_por_mim) {
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
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "own messages disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("[orbit-webhook] Resolved empresa_id:", empresaId);

    // Main message processing
    const phone = payload.phone?.replace(/\D/g, "") || payload.from?.replace(/\D/g, "");
    const messageText = payload.text?.message || payload.body || payload.caption || "";
    const messageId = payload.messageId || payload.id;
    const fromMe = payload.fromMe || eventType === "on-send";

    if (!phone || (fromMe && eventType !== "on-send")) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;

    // 1. Find or create prospect (with empresa_id)
    let prospectQuery = supabase
      .from("orbit_prospects")
      .select("*")
      .eq("telefone_whatsapp", normalizedPhone);
    if (empresaId) prospectQuery = prospectQuery.eq("empresa_id", empresaId);

    let { data: prospect } = await prospectQuery.maybeSingle();

    if (!prospect) {
      // Check prospect limit for demo plans
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
            return new Response(JSON.stringify({ ok: true, skipped: true, reason: "prospect_limit_reached" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      const insertData: any = {
        nome_razao: `WhatsApp ${normalizedPhone}`,
        telefone_whatsapp: normalizedPhone,
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
        console.error("[orbit-webhook] Erro ao criar prospect:", prospectError);
        throw prospectError;
      }
      prospect = newProspect;
    }

    // 2. Find or create conversation (with empresa_id)
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
