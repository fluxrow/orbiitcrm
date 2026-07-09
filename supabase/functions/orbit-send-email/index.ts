import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";
import { signOrbitMediaUrl } from "../_shared/orbit-media.ts";

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  empresa_id?: string;
  sender_user_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── JWT auth: require a valid user token ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401);
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims) {
      return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);
    }
    const userId = claimsRes.claims.sub as string;

    const { to, subject, html, empresa_id: bodyEmpresaId, sender_user_id }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios: to, subject, html", 200);
    }

    // ── Resolve caller identity (super_admin, profile empresa, memberships) ──
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuperAdmin = (roleRows ?? []).some((r: any) => r.role === "super_admin");

    const { data: profile } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();

    // ── Resolve empresa_id: prefer body, fall back to user profile ──
    let empresa_id: string | null = bodyEmpresaId || profile?.empresa_id || null;

    if (!empresa_id) {
      return fail(
        ErrorCodes.VALIDATION_ERROR,
        "empresa_id é obrigatório (não foi possível resolver pelo perfil do usuário)",
        400,
      );
    }

    // ── Unconditional membership check (super_admin bypass) ──
    if (!isSuperAdmin) {
      let belongs = profile?.empresa_id === empresa_id;
      if (!belongs) {
        const { data: membership } = await supabase
          .from("user_empresa_memberships")
          .select("empresa_id")
          .eq("user_id", userId)
          .eq("empresa_id", empresa_id)
          .maybeSingle();
        belongs = !!membership;
      }
      if (!belongs) {
        return fail(ErrorCodes.UNAUTHORIZED, "Usuário não pertence à empresa", 403);
      }
    }

    // ── Load sender user data for signature + reply-to ──
    let senderUser: any = null;
    if (sender_user_id) {
      const { data } = await supabase
        .from("pe_users")
        .select("full_name, cargo, phone, email, signature_image_url, email_signature, use_personal_signature")
        .eq("id", sender_user_id)
        .maybeSingle();
      senderUser = data;
    }

    // ── Plan enforcement (always) ──
    {
      const { data: canUseResult } = await supabase.rpc("saas_can_use", {
        p_empresa_id: empresa_id,
        p_feature_code: "email_send",
        p_amount: 1,
      });
      const planResponse = fromPlanCheck(canUseResult);
      if (planResponse) return planResponse;
    }

    // Check if empresa is on demo plan
    {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      if (planCode === "demo") {
        console.log("[orbit-send-email] Demo mode: skipping real send", { empresa_id, userId });
        await supabase.rpc("saas_increment_usage", {
          p_empresa_id: empresa_id,
          p_feature_code: "email_send",
          p_amount: 1,
        });
        return ok({ id: "simulated" }, { simulated: true });
      }
    }

    // Buscar configuração do Resend da empresa
    let resendApiKey: string | null = null;
    let fromEmail = "Orbit <onboarding@resend.dev>";

    let resendConfig = null;
    {
      const { data } = await supabase
        .from("orbit_resend_config")
        .select("*")
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      resendConfig = data;
    }

    if (!resendConfig) {
      const { data } = await supabase
        .from("orbit_resend_config")
        .select("*")
        .is("empresa_id", null)
        .maybeSingle();
      resendConfig = data;
    }

    if (resendConfig) {
      if (resendConfig.api_key) resendApiKey = resendConfig.api_key;
      if (resendConfig.ativo && resendConfig.from_email) {
        const fromName = resendConfig.from_name || "Orbit";
        fromEmail = `${fromName} <${resendConfig.from_email}>`;
      }
    }

    if (!resendApiKey) resendApiKey = Deno.env.get("RESEND_API_KEY") || null;

    if (!resendApiKey) {
      return fail(
        ErrorCodes.PROVIDER_NOT_CONFIGURED,
        "API Key do Resend não configurada. Configure a API Key nas configurações de email.",
        200,
      );
    }

    // ── Build signature HTML if sender has personal signature ──
    // Inject inline styles for email-compatible lists
    let finalHtml = html
      .replace(/<ul(?![^>]*style=)/gi, '<ul style="padding-left:20px;margin:10px 0;list-style-type:disc"')
      .replace(/<ol(?![^>]*style=)/gi, '<ol style="padding-left:20px;margin:10px 0;list-style-type:decimal"')
      .replace(/<li(?![^>]*style=)/gi, '<li style="margin-bottom:6px"');

    if (senderUser?.use_personal_signature) {
      let sigRows = "";
      if (senderUser.signature_image_url) {
        // Assinar URL do bucket privado orbit-media com TTL longo (30 dias)
        // — suficiente para o destinatário abrir o e-mail em janela usual.
        const signedSig = await signOrbitMediaUrl(supabase, senderUser.signature_image_url, 60 * 60 * 24 * 30) || senderUser.signature_image_url;
        // Image-only signature
        sigRows = `<tr><td style="padding-top:0"><img src="${signedSig}" width="400" alt="${senderUser.full_name || "Assinatura"}" style="max-width:100%;height:auto" /></td></tr>`;
      } else {
        // Text-based fallback
        if (senderUser.full_name) sigRows += `<tr><td style="font-weight:bold;font-size:14px;padding:0;margin:0">${senderUser.full_name}</td></tr>`;
        if (senderUser.cargo) sigRows += `<tr><td style="color:#666;font-size:13px;padding:0;margin:0">${senderUser.cargo}</td></tr>`;
        if (senderUser.phone) sigRows += `<tr><td style="color:#666;font-size:13px;padding:0;margin:0">${senderUser.phone}</td></tr>`;
        if (senderUser.email) sigRows += `<tr><td style="color:#666;font-size:13px;padding:0;margin:0">${senderUser.email}</td></tr>`;
      }
      if (sigRows) {
        finalHtml += `<table style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:16px;font-family:Arial,sans-serif" cellpadding="0" cellspacing="0">${sigRows}</table>`;
      }
    }

    // ── Determine reply-to ──
    const replyTo = senderUser?.email
      ? [senderUser.email]
      : resendConfig?.reply_to_email
        ? [resendConfig.reply_to_email]
        : undefined;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html: finalHtml,
        reply_to: replyTo,
      }),
    });

    const result = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Erro Resend:", result);
      return fail(
        ErrorCodes.PROVIDER_SEND_FAILED,
        result.message || "Erro ao enviar email",
        200,
        { provider: "resend" },
      );
    }

    // ── Increment usage after successful send ──
    await supabase.rpc("saas_increment_usage", {
      p_empresa_id: empresa_id,
      p_feature_code: "email_send",
      p_amount: 1,
    });

    console.log("Email enviado com sucesso:", result);
    return ok(result);
  } catch (error: any) {
    console.error("Erro ao enviar email:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 200);
  }
};

serve(handler);
