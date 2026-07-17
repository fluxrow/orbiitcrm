import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";
import { resolveCtaConfig, buildCtaButtonHtml, injectCta } from "../_shared/whatsapp-cta.ts";
import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";
import { signOrbitMediaUrl } from "../_shared/orbit-media.ts";

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

type ValidationResult = "valid" | "invalid" | "inconclusive";

async function validateWhatsAppNumber(
  phone: string,
  zapiBaseUrl: string,
  headers: Record<string, string>
): Promise<ValidationResult> {
  try {
    const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone}`, {
      method: "GET",
      headers,
    });
    const bodyText = await res.text();
    let result: any = null;
    try { result = JSON.parse(bodyText); } catch { /* ignore */ }

    console.log(`[validate] phone=${phone} http=${res.status} body=${bodyText.slice(0, 300)}`);

    if (!res.ok) {
      console.warn(`[validate] HTTP ${res.status} → inconclusive`);
      return "inconclusive";
    }
    if (!result || typeof result !== "object") {
      return "inconclusive";
    }
    // Z-API may return error / connected:false with HTTP 200
    if (result.error || result.connected === false) {
      console.warn(`[validate] Z-API error/disconnected → inconclusive`);
      return "inconclusive";
    }
    if (result.exists === true) return "valid";
    if (result.exists === false) return "invalid";
    // exists ausente / null → inconclusivo (não cachear como inválido)
    return "inconclusive";
  } catch (err) {
    console.error(`[validate] Exception for ${phone}:`, err);
    return "inconclusive";
  }
}

async function checkZapiInstanceStatus(
  zapiBaseUrl: string,
  headers: Record<string, string>
): Promise<{ connected: boolean; raw: any; httpStatus: number }> {
  try {
    const res = await fetch(`${zapiBaseUrl}/status`, { method: "GET", headers });
    const bodyText = await res.text();
    let raw: any = null;
    try { raw = JSON.parse(bodyText); } catch { /* ignore */ }
    console.log(`[zapi-status] http=${res.status} body=${bodyText.slice(0, 300)}`);
    const connected = !!(raw && (raw.connected === true || raw.smartphoneConnected === true));
    return { connected, raw, httpStatus: res.status };
  } catch (err) {
    console.error(`[zapi-status] Exception:`, err);
    return { connected: false, raw: null, httpStatus: 0 };
  }
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

function toTitleCase(str: string): string {
  if (!str) return "";
  const lower = ["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "as", "os", "com", "para", "por"];
  return str
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i > 0 && lower.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

const handler = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── JWT auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims) {
      return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);
    }
    const callerUserId = claimsRes.claims.sub as string;

    const { campaign_id }: CampaignRequest = await req.json();

    if (!campaign_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "campaign_id é obrigatório", 400, undefined, req);
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("orbit_campaigns")
      .select("*, template:orbit_message_templates(*)")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return fail(ErrorCodes.NOT_FOUND, "Campanha não encontrada", 404, undefined, req);
    }

    // ── Authorize: caller must belong to campaign.empresa_id (or be super_admin) ──
    if (campaign.empresa_id) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", callerUserId);
      const isSuperAdmin = (roleRows ?? []).some((r: any) => r.role === "super_admin");
      if (!isSuperAdmin) {
        const { data: callerProfile } = await supabase
          .from("profiles")
          .select("empresa_id")
          .eq("id", callerUserId)
          .maybeSingle();
        if (callerProfile?.empresa_id !== campaign.empresa_id) {
          return fail(ErrorCodes.UNAUTHORIZED, "Usuário não pertence à empresa da campanha", 403, undefined, req);
        }
      }
    }

    if (campaign.aprovacao_status !== "aprovada") {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campanha não aprovada", 400, undefined, req);
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
      if (planResponse) return fromPlanCheck(canUseResult, false, req)!;
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
      const { count: failedCount } = await supabase
        .from("orbit_campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .eq("status", "falhou");
      const { count: sentCount } = await supabase
        .from("orbit_campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign_id)
        .in("status", ["enviado", "simulated"]);
      const emptyFinalStatus = (failedCount || 0) > 0 && (sentCount || 0) === 0 ? "falha" : "concluida";
      await supabase.from("orbit_campaigns").update({ status: emptyFinalStatus }).eq("id", campaign_id);
      return ok({ enviados: 0, validados_enviados: 0, ignorados_sem_numero: 0, ignorados_sem_whatsapp: 0, ignorados_whatsapp_invalido: 0, falhas: 0, pausada_por_limite: false, message: "Campanha concluída" }, undefined, req);
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
    let senderUser: any = null;

    if (campaign.canal === "email") {
      const { data } = await supabase.from("orbit_resend_config").select("*").eq("empresa_id", campaign.empresa_id).maybeSingle();
      resendConfig = data;
      if (!resendConfig) {
        const { data: globalConfig } = await supabase.from("orbit_resend_config").select("*").is("empresa_id", null).maybeSingle();
        resendConfig = globalConfig;
      }

      // Load sender user for signature + reply-to
      if (campaign.created_by) {
        const { data: userData } = await supabase
          .from("pe_users")
          .select("full_name, cargo, phone, email, signature_image_url, signature_image_path, email_signature, use_personal_signature")
          .eq("id", campaign.created_by)
          .maybeSingle();
        senderUser = userData;
      }
    } else {
      zapiConfig = await getOrbitZapiRuntimeConfig(supabase, campaign.empresa_id);
    }

    const zapiBaseUrl = zapiConfig ? `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}` : "";
    const zapiHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Client-Token": zapiConfig?.client_token || "",
    };

    const templateImageUrl = campaign.template?.imagem_url || null;

    // ── Pré-check da instância Z-API (apenas WhatsApp) ──
    if (campaign.canal === "whatsapp" && zapiConfig?.instance_id && zapiConfig?.token) {
      const campaignBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig);
      if (campaignBlockReason) {
        console.error(`[send-campaign] Envio real bloqueado — aborting campaign ${campaign_id}`);
        await supabase
          .from("orbit_campaigns")
          .update({ status: "falha", motivo_reprovacao: "ZAPI_REAL_SEND_BLOCKED" })
          .eq("id", campaign_id);
        return fail(
          ErrorCodes.PROVIDER_NOT_CONFIGURED,
          campaignBlockReason,
          403,
          { code: "ZAPI_REAL_SEND_BLOCKED" },
          req,
        );
      }

      const status = await checkZapiInstanceStatus(zapiBaseUrl, zapiHeaders);
      if (!status.connected) {
        console.error(`[send-campaign] Z-API instance not connected — aborting campaign ${campaign_id}`);
        await supabase
          .from("orbit_campaigns")
          .update({ status: "falha", motivo_reprovacao: "ZAPI_DISCONNECTED" })
          .eq("id", campaign_id);
        return fail(
          ErrorCodes.PROVIDER_NOT_CONFIGURED,
          "A instância do WhatsApp (Z-API) está desconectada. Reconecte e tente novamente. Nenhum prospect foi marcado como inválido.",
          400,
          undefined,
          req
        );
      }
    }

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

        const getDisplayName = (p: any): string => {
          // 1. Se tem contato, usar contato
          if (p.nome_contato?.trim()) return p.nome_contato.trim();
          // 2. Se nome_razao não é telefone/placeholder, usar como empresa
          const nome = p.nome_razao || "";
          const digits = nome.replace(/\D/g, "");
          const isPhone = /^\d{8,}$/.test(digits) && digits.length >= 8;
          const isPlaceholder = nome.startsWith("WhatsApp ");
          if (!isPhone && !isPlaceholder && nome.trim()) return nome.trim();
          // 3. Fallback para nome_fantasia
          if (p.nome_fantasia?.trim()) return p.nome_fantasia.trim();
          // 4. Vazio — mensagem sem tag
          return "";
        };

        const getCompanyName = (p: any): string => {
          const nome = p.nome_razao || "";
          const digits = nome.replace(/\D/g, "");
          const isPhone = /^\d{8,}$/.test(digits) && digits.length >= 8;
          const isPlaceholder = nome.startsWith("WhatsApp ");
          if (!isPhone && !isPlaceholder && nome.trim()) return nome.trim();
          return p.nome_fantasia?.trim() || "";
        };

        const variaveis: Record<string, string> = {
          "{{nome}}": toTitleCase(getDisplayName(prospect)),
          "{{empresa}}": toTitleCase(getCompanyName(prospect)),
          "{{nome_fantasia}}": toTitleCase(prospect.nome_fantasia || ""),
          "{{email}}": prospect.email_principal || "",
          "{{telefone}}": prospect.telefone || prospect.whatsapp || "",
          "{{cidade}}": toTitleCase(prospect.cidade || ""),
          "{{segmento}}": toTitleCase(prospect.segmento || ""),
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
          emailHtml += html || mensagem.replace(/\n/g, "<br>");

          // ── Append personal signature ──
          if (senderUser?.use_personal_signature) {
            let sigRows = "";
            const sigSource = senderUser.signature_image_path || senderUser.signature_image_url;
            if (sigSource) {
              const signedSig = await signOrbitMediaUrl(supabase, sigSource, 60 * 60 * 24 * 30) || sigSource;
              sigRows = `<tr><td style="padding-top:8px"><img src="${signedSig}" width="400" alt="${senderUser.full_name || "Assinatura"}" style="max-width:100%;height:auto" /></td></tr>`;
            } else {
              if (senderUser.full_name) sigRows += `<tr><td style="font-weight:bold;font-size:14px;padding:0;margin:0">${senderUser.full_name}</td></tr>`;
              if (senderUser.cargo) sigRows += `<tr><td style="color:#666;font-size:13px;padding:0;margin:0">${senderUser.cargo}</td></tr>`;
              if (senderUser.phone) sigRows += `<tr><td style="color:#666;font-size:13px;padding:0;margin:0">${senderUser.phone}</td></tr>`;
              if (senderUser.email) sigRows += `<tr><td style="color:#666;font-size:13px;padding:0;margin:0">${senderUser.email}</td></tr>`;
            }
            if (sigRows) {
              emailHtml += `<table style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:16px;font-family:Arial,sans-serif" cellpadding="0" cellspacing="0">${sigRows}</table>`;
            }
          }

          // ── Dynamic Reply-To ──
          const replyTo = senderUser?.email
            ? [senderUser.email]
            : resendConfig?.reply_to_email
              ? [resendConfig.reply_to_email]
              : undefined;

          // ── Subject with variables ──
          let emailSubject = assunto;
          for (const [key, value] of Object.entries(variaveis)) {
            emailSubject = emailSubject.replace(new RegExp(key, "g"), value);
          }

          // ── Tracking: inject pixel + rewrite links ──
          const trackBaseUrl = `${supabaseUrl}/functions/v1/orbit-email-track`;
          const trackPixel = `<img src="${trackBaseUrl}?type=open&rid=${recipient.id}" width="1" height="1" style="display:none" alt="" />`;

          // ── WhatsApp CTA button (template/campanha config) ──
          const ctaCfg = resolveCtaConfig(campaign as any, campaign.template as any, zapiConfig?.numero_origem);
          if (ctaCfg) {
            const ctaHtml = buildCtaButtonHtml(
              ctaCfg,
              variaveis,
              (raw) => `${trackBaseUrl}?type=click&rid=${recipient.id}&url=${encodeURIComponent(raw)}`,
            );
            emailHtml = injectCta(emailHtml, ctaHtml, ctaCfg.posicao);
          }


          // Rewrite links for click tracking
          emailHtml = emailHtml.replace(
            /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
            (_match: string, before: string, href: string, after: string) => {
              // Skip mailto, tel, unsubscribe, and tracking URLs
              if (href.startsWith("mailto:") || href.startsWith("tel:") || href.includes("orbit-email-track")) {
                return `<a ${before}href="${href}"${after}>`;
              }
              const trackedUrl = `${trackBaseUrl}?type=click&rid=${recipient.id}&url=${encodeURIComponent(href)}`;
              return `<a ${before}href="${trackedUrl}"${after}>`;
            }
          );

          // Append tracking pixel
          if (emailHtml.includes("</body>")) {
            emailHtml = emailHtml.replace("</body>", `${trackPixel}</body>`);
          } else {
            emailHtml += trackPixel;
          }

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendConfig.api_key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: [prospect.email_principal],
              subject: emailSubject,
              html: emailHtml,
              reply_to: replyTo,
            }),
          });

          if (!emailRes.ok) {
            const err = await emailRes.json();
            throw new Error(err.message || "Erro ao enviar email");
          }

          // Capture resend_email_id
          const emailResult = await emailRes.json();
          const resendEmailId = emailResult?.id || null;

          if (resendEmailId) {
            await supabase
              .from("orbit_campaign_recipients")
              .update({ resend_email_id: resendEmailId })
              .eq("id", recipient.id);
          }

          // Log sent event
          await supabase.from("orbit_email_events").insert({
            recipient_id: recipient.id,
            empresa_id: campaign.empresa_id,
            resend_email_id: resendEmailId,
            event_type: "sent",
          });

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
          candidatePhone = normalizePhone(rawCandidate);

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

          validatedPhone = candidatePhone;
          let wasValidated = false;

          if (!isRecentlyValid) {
            await delayMs(300);
            let result = await validateWhatsAppNumber(candidatePhone, zapiBaseUrl, zapiHeaders);

            if (result === "invalid") {
              const stripped = candidatePhone.startsWith("55") ? candidatePhone.slice(2) : candidatePhone;
              if (stripped.length === 10) {
                const ddd = stripped.slice(0, 2);
                const rest = stripped.slice(2);
                const phoneWith9 = "55" + ddd + "9" + rest;
                await delayMs(300);
                const result9 = await validateWhatsAppNumber(phoneWith9, zapiBaseUrl, zapiHeaders);
                if (result9 === "valid") {
                  validatedPhone = phoneWith9;
                  result = "valid";
                } else if (result9 === "inconclusive") {
                  result = "inconclusive";
                }
              }
            }

            if (result === "inconclusive") {
              // NÃO marcar invalido, NÃO cachear — pular sem alterar status do prospect
              console.warn(`[send-campaign] Validation inconclusive for prospect ${prospect.id} phone ${candidatePhone} — skipping without caching`);
              await supabase
                .from("orbit_campaign_recipients")
                .update({ status: "falhou", erro: "ZAPI_INCONCLUSIVE" })
                .eq("id", recipient.id);
              falhas++;
              continue;
            }

            const updateData: Record<string, any> = {
              whatsapp_status: result === "valid" ? "valido" : "invalido",
              whatsapp_last_check_at: new Date().toISOString(),
            };
            if (result === "valid") {
              updateData.whatsapp = validatedPhone;
            }
            await supabase.from("orbit_prospects").update(updateData).eq("id", prospect.id);

            if (result === "invalid") {
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
            try {
              const imgRes = await fetch(`${zapiBaseUrl}/send-image`, {
                method: "POST",
                headers: zapiHeaders,
                body: JSON.stringify({ phone: validatedPhone, image: templateImageUrl, caption: "" }),
              });
              if (!imgRes.ok) {
                const errBody = await imgRes.text();
                console.error(`[send-campaign] Falha ao enviar imagem (${imgRes.status}) para ${validatedPhone}: ${errBody}`);
              } else {
                // pequeno delay entre imagem e texto para Z-API processar
                await delayMs(800);
              }
            } catch (imgErr: any) {
              console.error(`[send-campaign] Exceção ao enviar imagem para ${validatedPhone}:`, imgErr?.message);
            }
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

          // Log sent event for WhatsApp
          await supabase.from("orbit_email_events").insert({
            recipient_id: recipient.id,
            empresa_id: campaign.empresa_id,
            event_type: "sent",
            canal: "whatsapp",
          });

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

        // ── Registrar em Conversas (apenas WhatsApp) ──
        if (campaign.canal === "whatsapp") {
          const phoneForConversa = validatedPhone || candidatePhone || "";
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
        : (totalEnviados === 0 && falhas > 0)
          ? "falha"
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
      { simulated: isDemo },
      req
    );
  } catch (error: any) {
    console.error("Erro ao processar campanha:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500, undefined, req);
  }
};

serve(handler);
