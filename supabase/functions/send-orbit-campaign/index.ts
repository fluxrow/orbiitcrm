import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";

interface CampaignRequest {
  campaign_id: string;
}

const delayMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

const VALIDATION_CACHE_DAYS = 7;
const WARMUP_SCALE = [50, 80, 120, 200, 300, 500];

function isCheckExpired(lastCheck: string | null): boolean {
  if (!lastCheck) return true;
  const diff = Date.now() - new Date(lastCheck).getTime();
  return diff > VALIDATION_CACHE_DAYS * 24 * 60 * 60 * 1000;
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return "55" + digits;
  return digits;
}

async function validateWhatsAppNumber(
  phone: string,
  zapiBaseUrl: string,
  headers: Record<string, string>
): Promise<boolean> {
  const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone}`, {
    method: "GET",
    headers,
  });
  if (!res.ok) return false;
  const result = await res.json();
  return result.exists === true;
}

interface SendingConfig {
  min_delay_ms: number;
  max_delay_ms: number;
  batch_size: number;
  batch_pause_ms: number;
  daily_limit: number;
  max_per_minute: number;
  warmup_enabled: boolean;
  warmup_start_date: string | null;
  enabled: boolean;
}

const DEFAULT_CONFIG: SendingConfig = {
  min_delay_ms: 1500,
  max_delay_ms: 3500,
  batch_size: 50,
  batch_pause_ms: 30000,
  daily_limit: 500,
  max_per_minute: 15,
  warmup_enabled: false,
  warmup_start_date: null,
  enabled: true,
};

function getEffectiveLimit(config: SendingConfig): { limit: number; delayMultiplier: number } {
  if (!config.warmup_enabled || !config.warmup_start_date) {
    return { limit: config.daily_limit, delayMultiplier: 1 };
  }
  const startDate = new Date(config.warmup_start_date);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dayIndex = Math.max(0, daysDiff);
  const limit = dayIndex < WARMUP_SCALE.length ? WARMUP_SCALE[dayIndex] : config.daily_limit;
  const delayMultiplier = dayIndex < 3 ? 1.5 : 1;
  return { limit: Math.min(limit, config.daily_limit), delayMultiplier };
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
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
      .limit(500);

    if (!recipients || recipients.length === 0) {
      await supabase.from("orbit_campaigns").update({ status: "concluida" }).eq("id", campaign_id);
      return ok({ enviados: 0, validados_enviados: 0, ignorados_sem_numero: 0, ignorados_sem_whatsapp: 0, ignorados_whatsapp_invalido: 0, falhas: 0, pausada_por_limite: false, message: "Campanha concluída" });
    }

    let enviados = 0;
    let validados_enviados = 0;
    let ignorados_sem_numero = 0;
    let ignorados_sem_whatsapp = 0;
    let ignorados_whatsapp_invalido = 0;
    let falhas = 0;
    let pausada_por_limite = false;
    let batchSentCount = 0;

    // ── Load sending config ──
    let sendingConfig: SendingConfig = { ...DEFAULT_CONFIG };
    if (campaign.canal === "whatsapp" && campaign.empresa_id) {
      const { data: configRow } = await supabase
        .from("orbit_whatsapp_sending_config")
        .select("*")
        .eq("empresa_id", campaign.empresa_id)
        .maybeSingle();
      if (configRow) {
        sendingConfig = {
          min_delay_ms: configRow.min_delay_ms ?? DEFAULT_CONFIG.min_delay_ms,
          max_delay_ms: configRow.max_delay_ms ?? DEFAULT_CONFIG.max_delay_ms,
          batch_size: configRow.batch_size ?? DEFAULT_CONFIG.batch_size,
          batch_pause_ms: configRow.batch_pause_ms ?? DEFAULT_CONFIG.batch_pause_ms,
          daily_limit: configRow.daily_limit ?? DEFAULT_CONFIG.daily_limit,
          max_per_minute: configRow.max_per_minute ?? DEFAULT_CONFIG.max_per_minute,
          warmup_enabled: configRow.warmup_enabled ?? false,
          warmup_start_date: configRow.warmup_start_date,
          enabled: configRow.enabled ?? true,
        };
      }
    }

    const { limit: effectiveDailyLimit, delayMultiplier } = getEffectiveLimit(sendingConfig);
    const effectiveMinDelay = Math.round(sendingConfig.min_delay_ms * delayMultiplier);
    const effectiveMaxDelay = Math.round(sendingConfig.max_delay_ms * delayMultiplier);

    // ── Load/create daily usage ──
    let dailySentCount = 0;
    if (campaign.canal === "whatsapp" && campaign.empresa_id) {
      const today = new Date().toISOString().split("T")[0];
      const { data: usageRow } = await supabase
        .from("orbit_whatsapp_daily_usage")
        .select("sent_count")
        .eq("empresa_id", campaign.empresa_id)
        .eq("usage_date", today)
        .maybeSingle();

      if (usageRow) {
        dailySentCount = usageRow.sent_count || 0;
      } else {
        await supabase.from("orbit_whatsapp_daily_usage").insert({
          empresa_id: campaign.empresa_id,
          usage_date: today,
          sent_count: 0,
        });
      }
    }

    let resendConfig = null;
    let zapiConfig = null;

    if (campaign.canal === "email") {
      const { data } = await supabase.from("orbit_resend_config").select("*").eq("empresa_id", campaign.empresa_id).maybeSingle();
      resendConfig = data;
      if (!resendConfig) {
        const { data: globalConfig } = await supabase.from("orbit_resend_config").select("*").is("empresa_id", null).maybeSingle();
        resendConfig = globalConfig;
      }
    } else {
      const { data } = await supabase.from("orbit_zapi_config").select("*").eq("empresa_id", campaign.empresa_id).maybeSingle();
      zapiConfig = data;
    }

    const zapiBaseUrl = zapiConfig ? `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}` : "";
    const zapiHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Client-Token": zapiConfig?.client_token || "",
    };

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
          "{{nome}}": (prospect.nome_razao || "").toUpperCase(),
          "{{nome_fantasia}}": (prospect.nome_fantasia || "").toUpperCase(),
          "{{email}}": prospect.email_principal || "",
          "{{telefone}}": prospect.telefone || prospect.whatsapp || "",
          "{{cidade}}": (prospect.cidade || "").toUpperCase(),
          "{{segmento}}": (prospect.segmento || "").toUpperCase(),
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

        let validatedPhone = "";
        let candidatePhone = "";

        if (campaign.canal === "email") {
          // ── Email sending ──
          if (!resendConfig?.api_key || !prospect.email_principal) {
            await supabase.from("orbit_campaign_recipients").update({ status: "falhou", erro: "Email não configurado ou prospect sem email" }).eq("id", recipient.id);
            falhas++;
            continue;
          }

          const fromEmail = resendConfig.from_email
            ? `${resendConfig.from_name || "Orbit"} <${resendConfig.from_email}>`
            : "Orbit <onboarding@resend.dev>";

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
              subject: assunto.replace(/{{nome}}/g, (prospect.nome_razao || "").toUpperCase()),
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
          // ── WhatsApp sending with rate limiting ──

          // Check daily limit
          if (dailySentCount >= effectiveDailyLimit) {
            pausada_por_limite = true;
            // Mark remaining as pendente still — just stop
            break;
          }

          // 1. Determine candidate phone
          const rawCandidate = prospect.whatsapp || prospect.telefone || "";
          const candidatePhone = normalizePhone(rawCandidate);

          if (!candidatePhone) {
            await supabase.from("orbit_campaign_recipients").update({ status: "ignorado", erro: "IGNORED_NO_NUMBER" }).eq("id", recipient.id);
            ignorados_sem_numero++;
            continue;
          }

          // 2. Already cached as invalid
          if (prospect.whatsapp_status === "invalido" && !isCheckExpired(prospect.whatsapp_last_check_at)) {
            await supabase.from("orbit_campaign_recipients").update({ status: "ignorado", erro: "IGNORED_INVALID_WHATSAPP" }).eq("id", recipient.id);
            ignorados_whatsapp_invalido++;
            continue;
          }

          // 3. Z-API config check
          if (!zapiConfig?.instance_id || !zapiConfig?.token) {
            await supabase.from("orbit_campaign_recipients").update({ status: "falhou", erro: "Z-API não configurado" }).eq("id", recipient.id);
            falhas++;
            continue;
          }

          // 4. Check if we can skip validation
          const isRecentlyValid =
            prospect.whatsapp_status === "valido" &&
            !isCheckExpired(prospect.whatsapp_last_check_at);

          let validatedPhone = candidatePhone;
          let wasValidated = false;

          if (!isRecentlyValid) {
            await delayMs(300);
            let exists = await validateWhatsAppNumber(candidatePhone, zapiBaseUrl, zapiHeaders);

            if (!exists) {
              const stripped = candidatePhone.startsWith("55") ? candidatePhone.slice(2) : candidatePhone;
              if (stripped.length === 10) {
                const ddd = stripped.slice(0, 2);
                const rest = stripped.slice(2);
                const phoneWith9 = "55" + ddd + "9" + rest;
                await delayMs(300);
                exists = await validateWhatsAppNumber(phoneWith9, zapiBaseUrl, zapiHeaders);
                if (exists) {
                  validatedPhone = phoneWith9;
                }
              }
            }

            const updateData: Record<string, any> = {
              whatsapp_status: exists ? "valido" : "invalido",
              whatsapp_last_check_at: new Date().toISOString(),
            };
            if (exists) {
              updateData.whatsapp = validatedPhone;
            }
            await supabase.from("orbit_prospects").update(updateData).eq("id", prospect.id);

            if (!exists) {
              await supabase.from("orbit_campaign_recipients").update({ status: "ignorado", erro: "IGNORED_NO_WHATSAPP" }).eq("id", recipient.id);
              ignorados_sem_whatsapp++;
              continue;
            }

            wasValidated = true;
          }

          // 5. Rate-limited delay before sending
          await delayMs(randomDelay(effectiveMinDelay, effectiveMaxDelay));

          // 6. Send WhatsApp message
          if (templateImageUrl) {
            await fetch(`${zapiBaseUrl}/send-image`, {
              method: "POST",
              headers: zapiHeaders,
              body: JSON.stringify({ phone: validatedPhone, image: templateImageUrl, caption: "" }),
            });
          }

          const zapiRes = await fetch(`${zapiBaseUrl}/send-text`, {
            method: "POST",
            headers: zapiHeaders,
            body: JSON.stringify({ phone: validatedPhone, message: mensagem }),
          });

          if (!zapiRes.ok) {
            const err = await zapiRes.json();
            throw new Error(err.message || "Erro ao enviar WhatsApp");
          }

          if (wasValidated) {
            validados_enviados++;
          } else {
            enviados++;
          }

          // 7. Increment daily usage
          dailySentCount++;
          batchSentCount++;

          if (campaign.empresa_id) {
            const today = new Date().toISOString().split("T")[0];
            await supabase
              .from("orbit_whatsapp_daily_usage")
              .upsert(
                { empresa_id: campaign.empresa_id, usage_date: today, sent_count: dailySentCount, updated_at: new Date().toISOString() },
                { onConflict: "empresa_id,usage_date" }
              );
          }

          // 8. Batch pause
          if (batchSentCount >= sendingConfig.batch_size) {
            console.log(`Batch de ${sendingConfig.batch_size} concluído, pausando ${sendingConfig.batch_pause_ms}ms...`);
            await delayMs(sendingConfig.batch_pause_ms);
            batchSentCount = 0;
          }
        }

        // ── Registrar em Conversas ──
        const phoneForConversa = campaign.canal === "whatsapp" ? (validatedPhone || candidatePhone || "") : (prospect.telefone || prospect.whatsapp || "");
        if (phoneForConversa && campaign.empresa_id) {
          try {
            let conversaId: string | null = null;
            const { data: existingConversa } = await supabase
              .from("orbit_conversas")
              .select("id, ai_contexto")
              .eq("prospect_id", prospect.id)
              .eq("empresa_id", campaign.empresa_id)
              .eq("status", "aberta")
              .maybeSingle();

            if (existingConversa) {
              conversaId = existingConversa.id;
              const existingCtx = (existingConversa as any).ai_contexto || {};
              await supabase.from("orbit_conversas").update({
                ai_contexto: {
                  ...existingCtx,
                  origin: "outbound_campaign",
                  campaign_id: campaign.id,
                  intro_already_sent: true,
                  estado: "aguardando_resposta",
                },
                ultima_mensagem_at: new Date().toISOString(),
                ultima_mensagem_preview: mensagem.substring(0, 100),
              }).eq("id", conversaId);
            } else {
              const { data: novaConversa } = await supabase
                .from("orbit_conversas")
                .insert({
                  empresa_id: campaign.empresa_id,
                  prospect_id: prospect.id,
                  canal: campaign.canal,
                  telefone_whatsapp: phoneForConversa,
                  status: "aberta",
                  ultima_mensagem_at: new Date().toISOString(),
                  ultima_mensagem_preview: mensagem.substring(0, 100),
                  ai_contexto: {
                    origin: "outbound_campaign",
                    campaign_id: campaign.id,
                    intro_already_sent: true,
                    estado: "aguardando_resposta",
                  },
                })
                .select("id")
                .single();
              conversaId = novaConversa?.id || null;
            }

            if (conversaId) {
              await supabase.from("orbit_mensagens").insert({
                conversa_id: conversaId,
                empresa_id: campaign.empresa_id,
                direcao: "OUT",
                mensagem,
                canal: campaign.canal,
                status: isDemo ? "simulated" : "enviada",
                campaign_id: campaign.id,
              });

              await supabase.from("orbit_conversas").update({
                ultima_mensagem_at: new Date().toISOString(),
                ultima_mensagem_preview: mensagem.substring(0, 100),
              }).eq("id", conversaId);
            }
          } catch (convError: any) {
            console.error(`Erro ao registrar conversa para ${recipient.id}:`, convError.message);
          }
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

    const totalEnviados = enviados + validados_enviados;

    // Count remaining pending
    const { count: remainingPending } = await supabase
      .from("orbit_campaign_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pendente");

    const finalStatus = pausada_por_limite
      ? "pausada_por_limite"
      : (remainingPending && remainingPending > 0)
        ? "enviando"
        : "concluida";

    await supabase.from("orbit_campaigns").update({
      enviados: (campaign.enviados || 0) + totalEnviados,
      falhas: (campaign.falhas || 0) + falhas,
      status: finalStatus,
    }).eq("id", campaign_id);

    return ok(
      {
        enviados,
        validados_enviados,
        ignorados_sem_numero,
        ignorados_sem_whatsapp,
        ignorados_whatsapp_invalido,
        falhas,
        pausada_por_limite,
        remaining_pending: remainingPending || 0,
      },
      { simulated: isDemo }
    );
  } catch (error: any) {
    console.error("Erro ao processar campanha:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
