import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";

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

    const { to, subject, html, empresa_id, sender_user_id }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios: to, subject, html", 200);
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

    // ── Plan enforcement ──
    if (empresa_id) {
      const { data: canUseResult } = await supabase.rpc("saas_can_use", {
        p_empresa_id: empresa_id,
        p_feature_code: "email_send",
        p_amount: 1,
      });

      const planResponse = fromPlanCheck(canUseResult);
      if (planResponse) return planResponse;
    }

    // Check if empresa is on demo plan
    if (empresa_id) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      if (planCode === "demo") {
        console.log("[orbit-send-email] Demo mode: skipping real send");
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
    if (empresa_id) {
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
        html,
        reply_to: resendConfig?.reply_to_email ? [resendConfig.reply_to_email] : undefined,
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
    if (empresa_id) {
      await supabase.rpc("saas_increment_usage", {
        p_empresa_id: empresa_id,
        p_feature_code: "email_send",
        p_amount: 1,
      });
    }

    console.log("Email enviado com sucesso:", result);
    return ok(result);
  } catch (error: any) {
    console.error("Erro ao enviar email:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 200);
  }
};

serve(handler);
