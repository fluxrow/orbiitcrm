import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";

interface CampaignRequest {
  campaign_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { campaign_id }: CampaignRequest = await req.json();

    if (!campaign_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "campaign_id é obrigatório");
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("orbit_campaigns")
      .select("*, template:orbit_message_templates(*)")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return fail(ErrorCodes.NOT_FOUND, "Campanha não encontrada", 404);
    }

    if (campaign.aprovacao_status !== "aprovada") {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campanha não aprovada");
    }

    // ── Plan enforcement ──
    const featureCode = campaign.canal === "email" ? "email_send" : "whatsapp_send";

    const { count: pendingCount } = await supabase
      .from("orbit_campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pendente");

    const recipientAmount = pendingCount || 0;

    if (campaign.empresa_id && recipientAmount > 0) {
      const { data: canUseResult } = await supabase.rpc("saas_can_use", {
        p_empresa_id: campaign.empresa_id,
        p_feature_code: featureCode,
        p_amount: recipientAmount,
      });

      const planResponse = fromPlanCheck(canUseResult);
      if (planResponse) return planResponse;
    }

    // Check if demo
    let isDemo = false;
    if (campaign.empresa_id) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", campaign.empresa_id)
        .maybeSingle();
      isDemo = (saasEmpresa?.plan as any)?.code === "demo";
    }

    await supabase.from("orbit_campaigns").update({ status: "enviando" }).eq("id", campaign_id);

    const { data: recipients } = await supabase
      .from("orbit_campaign_recipients")
      .select("*, prospect:orbit_prospects(*)")
      .eq("campaign_id", campaign_id)
      .eq("status", "pendente")
      .limit(100);

    if (!recipients || recipients.length === 0) {
      await supabase.from("orbit_campaigns").update({ status: "concluida" }).eq("id", campaign_id);
      return ok({ enviados: 0, falhas: 0, message: "Campanha concluída" });
    }

    let enviados = 0;
    let falhas = 0;

    let resendConfig = null;
    let zapiConfig = null;

    if (campaign.canal === "email") {
      const { data } = await supabase.from("orbit_resend_config").select("*").eq("empresa_id", campaign.empresa_id).maybeSingle();
      resendConfig = data;
    } else {
      const { data } = await supabase.from("orbit_zapi_config").select("*").eq("empresa_id", campaign.empresa_id).maybeSingle();
      zapiConfig = data;
    }

    // Get template image URL
    const templateImageUrl = campaign.template?.imagem_url || null;

    for (const recipient of recipients) {
      try {
        const prospect = recipient.prospect;
        if (!prospect) {
          await supabase.from("orbit_campaign_recipients").update({ status: "falhou", erro: "Prospect não encontrado" }).eq("id", recipient.id);
          falhas++;
          continue;
        }

        let mensagem = campaign.template?.corpo_texto || "";
        let html = campaign.template?.corpo_html || "";
        const assunto = campaign.template?.assunto_email || "";

        const variaveis: Record<string, string> = {
          "{{nome}}": prospect.nome_razao || "",
          "{{nome_fantasia}}": prospect.nome_fantasia || "",
          "{{email}}": prospect.email_principal || "",
          "{{telefone}}": prospect.telefone || prospect.whatsapp || "",
          "{{cidade}}": prospect.cidade || "",
          "{{segmento}}": prospect.segmento || "",
        };

        for (const [key, value] of Object.entries(variaveis)) {
          mensagem = mensagem.replace(new RegExp(key, "g"), value);
          html = html.replace(new RegExp(key, "g"), value);
        }

        if (isDemo) {
          await supabase.from("orbit_campaign_recipients").update({ status: "simulated", enviado_em: new Date().toISOString() }).eq("id", recipient.id);
          enviados++;
          if (campaign.empresa_id) {
            await supabase.rpc("saas_increment_usage", { p_empresa_id: campaign.empresa_id, p_feature_code: featureCode, p_amount: 1 });
          }
          continue;
        }

        if (campaign.canal === "email") {
          if (!resendConfig?.api_key || !prospect.email_principal) {
            await supabase.from("orbit_campaign_recipients").update({ status: "falhou", erro: "Email não configurado ou prospect sem email" }).eq("id", recipient.id);
            falhas++;
            continue;
          }

          const fromEmail = resendConfig.from_email
            ? `${resendConfig.from_name || "Orbit"} <${resendConfig.from_email}>`
            : "Orbit <onboarding@resend.dev>";

          // Build HTML with image before text
          let emailHtml = "";
          if (templateImageUrl) {
            emailHtml += `<div style="margin-bottom:16px"><img src="${templateImageUrl}" alt="Campanha" style="max-width:100%;height:auto;border-radius:8px" /></div>`;
          }
          emailHtml += html || `<p>${mensagem}</p>`;

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendConfig.api_key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: [prospect.email_principal],
              subject: assunto.replace(/{{nome}}/g, prospect.nome_razao || ""),
              html: emailHtml,
              reply_to: resendConfig?.reply_to_email ? [resendConfig.reply_to_email] : undefined,
            }),
          });

          if (!emailRes.ok) {
            const err = await emailRes.json();
            throw new Error(err.message || "Erro ao enviar email");
          }
          enviados++;
        } else {
          if (!zapiConfig?.instance_id || !zapiConfig?.token || !prospect.whatsapp) {
            await supabase.from("orbit_campaign_recipients").update({ status: "falhou", erro: "Z-API não configurado ou prospect sem WhatsApp" }).eq("id", recipient.id);
            falhas++;
            continue;
          }

          const phone = prospect.whatsapp.replace(/\D/g, "");
          const zapiBaseUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}`;

          // Send image first if present
          if (templateImageUrl) {
            await fetch(`${zapiBaseUrl}/send-image`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone, image: templateImageUrl, caption: "" }),
            });
          }

          // Then send text
          const zapiRes = await fetch(`${zapiBaseUrl}/send-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, message: mensagem }),
          });

          if (!zapiRes.ok) {
            const err = await zapiRes.json();
            throw new Error(err.message || "Erro ao enviar WhatsApp");
          }
          enviados++;
        }

        await supabase.from("orbit_campaign_recipients").update({ status: "enviado", enviado_em: new Date().toISOString() }).eq("id", recipient.id);

        if (campaign.empresa_id) {
          await supabase.rpc("saas_increment_usage", { p_empresa_id: campaign.empresa_id, p_feature_code: featureCode, p_amount: 1 });
        }
      } catch (error: any) {
        console.error(`Erro ao enviar para ${recipient.id}:`, error);
        await supabase.from("orbit_campaign_recipients").update({ status: "falhou", erro: error.message }).eq("id", recipient.id);
        falhas++;
      }
    }

    await supabase.from("orbit_campaigns").update({
      enviados: (campaign.enviados || 0) + enviados,
      falhas: (campaign.falhas || 0) + falhas,
      status: recipients.length <= 100 ? "concluida" : "enviando",
    }).eq("id", campaign_id);

    return ok({ enviados, falhas }, { simulated: isDemo });
  } catch (error: any) {
    console.error("Erro ao processar campanha:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
