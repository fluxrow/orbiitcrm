import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CampaignRequest {
  campaign_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { campaign_id }: CampaignRequest = await req.json();

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id é obrigatório" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar campanha
    const { data: campaign, error: campaignError } = await supabase
      .from("orbit_campaigns")
      .select("*, template:orbit_message_templates(*)")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campanha não encontrada" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verificar se aprovada
    if (campaign.aprovacao_status !== "aprovada") {
      return new Response(
        JSON.stringify({ error: "Campanha não aprovada" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if empresa is on demo plan
    let isDemo = false;
    if (campaign.empresa_id) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", campaign.empresa_id)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      isDemo = planCode === "demo";
    }

    // Verificar limite diário (para WhatsApp)
    if (campaign.canal === "whatsapp") {
      const today = new Date().toISOString().split("T")[0];
      const { data: limitData } = await supabase
        .from("orbit_whatsapp_daily_limits")
        .select("*")
        .eq("empresa_id", campaign.empresa_id)
        .eq("data", today)
        .maybeSingle();

      const currentCount = limitData?.mensagens_enviadas || 0;
      const limit = limitData?.limite_diario || 1000;

      if (currentCount >= limit) {
        return new Response(
          JSON.stringify({ error: "Limite diário de WhatsApp atingido" }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Atualizar status para enviando
    await supabase
      .from("orbit_campaigns")
      .update({ status: "enviando" })
      .eq("id", campaign_id);

    // Buscar destinatários pendentes
    const { data: recipients } = await supabase
      .from("orbit_campaign_recipients")
      .select("*, prospect:orbit_prospects(*)")
      .eq("campaign_id", campaign_id)
      .eq("status", "pendente")
      .limit(100); // Processar em lotes

    if (!recipients || recipients.length === 0) {
      // Campanha concluída
      await supabase
        .from("orbit_campaigns")
        .update({ status: "concluida" })
        .eq("id", campaign_id);

      return new Response(
        JSON.stringify({ success: true, message: "Campanha concluída", enviados: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let enviados = 0;
    let falhas = 0;

    // Buscar configurações
    let resendConfig = null;
    let zapiConfig = null;

    if (campaign.canal === "email") {
      const { data } = await supabase
        .from("orbit_resend_config")
        .select("*")
        .eq("empresa_id", campaign.empresa_id)
        .maybeSingle();
      resendConfig = data;
    } else {
      const { data } = await supabase
        .from("orbit_zapi_config")
        .select("*")
        .eq("empresa_id", campaign.empresa_id)
        .maybeSingle();
      zapiConfig = data;
    }

    // Processar cada destinatário
    for (const recipient of recipients) {
      try {
        const prospect = recipient.prospect;
        if (!prospect) {
          await supabase
            .from("orbit_campaign_recipients")
            .update({ status: "falhou", erro: "Prospect não encontrado" })
            .eq("id", recipient.id);
          falhas++;
          continue;
        }

        // Substituir variáveis no template
        let mensagem = campaign.template?.corpo_texto || "";
        let html = campaign.template?.corpo_html || "";
        const assunto = campaign.template?.assunto_email || "";

        const variaveis: Record<string, string> = {
          "{{nome}}": prospect.nome_razao || "",
          "{{nome_fantasia}}": prospect.nome_fantasia || "",
          "{{email}}": prospect.email_principal || "",
          "{{telefone}}": prospect.telefone_whatsapp || "",
          "{{cidade}}": prospect.cidade || "",
          "{{segmento}}": prospect.segmento || "",
        };

        for (const [key, value] of Object.entries(variaveis)) {
          mensagem = mensagem.replace(new RegExp(key, "g"), value);
          html = html.replace(new RegExp(key, "g"), value);
        }

        // Demo mode: skip provider calls, mark as simulated
        if (isDemo) {
          await supabase
            .from("orbit_campaign_recipients")
            .update({ status: "simulated", enviado_em: new Date().toISOString() })
            .eq("id", recipient.id);
          enviados++;
          continue;
        }

        if (campaign.canal === "email") {
          // Enviar email via Resend
          if (!resendConfig?.api_key || !prospect.email_principal) {
            await supabase
              .from("orbit_campaign_recipients")
              .update({ status: "falhou", erro: "Email não configurado ou prospect sem email" })
              .eq("id", recipient.id);
            falhas++;
            continue;
          }

          const fromEmail = resendConfig.from_email 
            ? `${resendConfig.from_name || "Orbit"} <${resendConfig.from_email}>`
            : "Orbit <onboarding@resend.dev>";

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendConfig.api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [prospect.email_principal],
              subject: assunto.replace(/{{nome}}/g, prospect.nome_razao || ""),
              html: html || `<p>${mensagem}</p>`,
            }),
          });

          if (!emailRes.ok) {
            const err = await emailRes.json();
            throw new Error(err.message || "Erro ao enviar email");
          }

          enviados++;
        } else {
          // Enviar WhatsApp via Z-API
          if (!zapiConfig?.instance_id || !zapiConfig?.token || !prospect.telefone_whatsapp) {
            await supabase
              .from("orbit_campaign_recipients")
              .update({ status: "falhou", erro: "Z-API não configurado ou prospect sem telefone" })
              .eq("id", recipient.id);
            falhas++;
            continue;
          }

          const phone = prospect.telefone_whatsapp.replace(/\D/g, "");
          const zapiUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`;

          const zapiRes = await fetch(zapiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, message: mensagem }),
          });

          if (!zapiRes.ok) {
            const err = await zapiRes.json();
            throw new Error(err.message || "Erro ao enviar WhatsApp");
          }

          enviados++;

          // Atualizar limite diário
          const today = new Date().toISOString().split("T")[0];
          try {
            // Tentar incrementar ou inserir limite diário
            const { data: existingLimit } = await supabase
              .from("orbit_whatsapp_daily_limits")
              .select("*")
              .eq("empresa_id", campaign.empresa_id)
              .eq("data", today)
              .maybeSingle();

            if (existingLimit) {
              await supabase
                .from("orbit_whatsapp_daily_limits")
                .update({ mensagens_enviadas: (existingLimit.mensagens_enviadas || 0) + 1 })
                .eq("id", existingLimit.id);
            } else {
              await supabase
                .from("orbit_whatsapp_daily_limits")
                .insert({ 
                  empresa_id: campaign.empresa_id, 
                  data: today, 
                  mensagens_enviadas: 1 
                });
            }
          } catch (e) {
            console.error("Erro ao atualizar limite diário:", e);
          }
        }

        // Marcar como enviado
        await supabase
          .from("orbit_campaign_recipients")
          .update({ status: "enviado", enviado_em: new Date().toISOString() })
          .eq("id", recipient.id);

      } catch (error: any) {
        console.error(`Erro ao enviar para ${recipient.id}:`, error);
        await supabase
          .from("orbit_campaign_recipients")
          .update({ status: "falhou", erro: error.message })
          .eq("id", recipient.id);
        falhas++;
      }
    }

    // Atualizar contadores da campanha
    await supabase
      .from("orbit_campaigns")
      .update({
        enviados: (campaign.enviados || 0) + enviados,
        falhas: (campaign.falhas || 0) + falhas,
        status: recipients.length <= 100 ? "concluida" : "enviando",
      })
      .eq("id", campaign_id);

    return new Response(
      JSON.stringify({ success: true, enviados, falhas }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Erro ao processar campanha:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
