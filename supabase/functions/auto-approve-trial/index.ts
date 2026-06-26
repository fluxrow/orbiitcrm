import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

interface TrialRequest {
  trial_id?: string;
  nome: string;
  empresa: string;
  email: string;
  telefone?: string;
  plan_code: "basic" | "professional" | "plus";
}

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getAppUrl(req: Request): string {
  const envUrl = Deno.env.get("APP_URL");
  if (envUrl) return envUrl.replace(/\/$/, "");
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (origin) { try { return new URL(origin).origin; } catch { /* ignore */ } }
  return "https://orbit.fluxrow.pro";
}

// getResendApiKey removed — now using getSystemEmailConfig from _shared/system-email.ts

function buildEmailHtml(empresaNome: string, planName: string, activationUrl: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Orbit</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 16px;color:#1a1a2e;">Bem-vindo ao Orbit CRM!</h2>
    <p style="color:#555;line-height:1.6;">Olá! A empresa <strong>${empresaNome}</strong> foi pré-cadastrada para você no plano <strong>${planName}</strong> com 7 dias de trial gratuito.</p>
    <p style="color:#555;line-height:1.6;">Clique no botão abaixo para criar sua senha e ativar sua conta.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td align="center">
        <a href="${activationUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Ativar Minha Conta</a>
      </td></tr>
    </table>
    <p style="color:#999;font-size:13px;">Este link expira em 48 horas.</p>
    <p style="color:#ccc;font-size:12px;margin-top:24px;">Se você não solicitou este acesso, ignore este e-mail.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const body: TrialRequest = await req.json();

    // Validate
    if (!body.nome?.trim() || !body.empresa?.trim() || !body.email?.trim() || !body.plan_code) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios faltando");
    }
    const validPlans = ["basic", "professional", "plus"];
    if (!validPlans.includes(body.plan_code)) {
      return fail(ErrorCodes.VALIDATION_ERROR, "plan_code inválido");
    }

    const email = body.email.trim().toLowerCase();

    let trialReqId: string;

    if (body.trial_id) {
      // Admin approval flow: require super_admin JWT
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) {
        return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401);
      }
      const { data: userRes, error: userErr } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userErr || !userRes?.user) {
        return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);
      }
      const { data: isSuper } = await supabase.rpc("has_role", {
        _user_id: userRes.user.id,
        _role: "super_admin",
      });
      if (!isSuper) {
        return fail(ErrorCodes.UNAUTHORIZED, "Acesso negado", 403);
      }

      const { error: updErr } = await supabase
        .from("trial_requests")
        .update({ status: "approved" })
        .eq("id", body.trial_id);
      if (updErr) {
        console.error("trial_requests update error:", updErr);
        return fail(ErrorCodes.INTERNAL_ERROR, "Erro ao atualizar solicitação", 500);
      }
      trialReqId = body.trial_id;

    } else {
      // Public form flow: check duplicates
      const { data: existingTrial } = await supabase
        .from("trial_requests")
        .select("id")
        .eq("email", email)
        .in("status", ["pending", "approved"])
        .limit(1)
        .maybeSingle();

      if (existingTrial) {
        return fail(ErrorCodes.VALIDATION_ERROR, "Já existe uma solicitação para este e-mail. Aguarde o processamento ou entre em contato.", 409);
      }

      const { data: trialReq, error: trialErr } = await supabase
        .from("trial_requests")
        .insert({
          nome: body.nome.trim(),
          empresa: body.empresa.trim(),
          email,
          telefone: body.telefone?.trim() || null,
          plan_code: body.plan_code,
          status: "approved",
        })
        .select("id")
        .single();

      if (trialErr) {
        console.error("trial_requests insert error:", trialErr);
        return fail(ErrorCodes.INTERNAL_ERROR, "Erro ao registrar solicitação", 500);
      }
      trialReqId = trialReq.id;
    }

    // Invalidate previous invites for same email BEFORE duplicate check
    await supabase
      .from("saas_invites")
      .update({ expires_at: new Date().toISOString() })
      .eq("email", email)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString());

    // 2) Get plan
    const { data: plan } = await supabase.from("saas_plans").select("id, name").eq("code", body.plan_code).single();
    if (!plan) return fail(ErrorCodes.NOT_FOUND, "Plano não encontrado", 404);

    // 3) Create empresa (ativo=false until activation)
    const { data: empresa, error: empErr } = await supabase
      .from("orbit_empresas")
      .insert({ nome: body.empresa.trim(), ativo: false })
      .select()
      .single();

    if (empErr) {
      console.error("orbit_empresas insert error:", empErr);
      return fail(ErrorCodes.INTERNAL_ERROR, `Erro ao criar empresa: ${empErr.message}`, 500);
    }

    try {
      // 4) Create saas_empresa (status=invited)
      // Use a system-level created_by: pick first super_admin or use a sentinel
      const { data: superAdmin } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin")
        .limit(1)
        .single();

      const createdByUserId = superAdmin?.user_id || "00000000-0000-0000-0000-000000000000";

      const { error: saasErr } = await supabase.from("saas_empresa").insert({
        empresa_id: empresa.id,
        plan_id: plan.id,
        status: "invited",
        responsible_name: body.nome.trim(),
        responsible_email: email,
        invited_at: new Date().toISOString(),
        created_by_user_id: createdByUserId,
      });
      if (saasErr) throw new Error(`saas_empresa: ${saasErr.message}`);

      // 5) (invalidation already done above)

      // 6) Generate invite token
      const tokenPlaintext = generateToken();
      const tokenHash = await hashToken(tokenPlaintext);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const { data: invite, error: invErr } = await supabase.from("saas_invites").insert({
        empresa_id: empresa.id,
        email,
        responsible_name: body.nome.trim(),
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by_user_id: createdByUserId,
      }).select("id, expires_at").single();
      if (invErr) throw new Error(`saas_invites: ${invErr.message}`);

      // 7) Send activation email — always use "Orbit" as sender for system emails
      const { apiKey: resendKey, fromEmail } = await getSystemEmailConfig(supabase);
      let emailSent = false;
      if (resendKey) {
        const appUrl = getAppUrl(req);
        const activationUrl = `${appUrl}/accept-invite?token=${tokenPlaintext}`;
        const emailHtml = buildEmailHtml(body.empresa.trim(), plan.name, activationUrl);
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: `Ative sua conta: ${body.empresa.trim()} — Orbit CRM`,
            html: emailHtml,
          }),
        });
        if (emailRes.ok) {
          emailSent = true;
        } else {
          const err = await emailRes.text();
          console.error("Resend error:", err);
        }
      } else {
        console.warn("RESEND_API_KEY não configurada — email não enviado");
      }

      // 8) Audit log
      await supabase.from("pe_audit_log").insert({
        actor_user_id: createdByUserId,
        action: "TRIAL_AUTO_APPROVED",
        entity_type: "trial_requests",
        entity_id: trialReqId,
        metadata: {
          empresa_id: empresa.id,
          invite_id: invite.id,
          email,
          plan_code: body.plan_code,
          email_sent: emailSent,
        },
      });

      return ok({
        empresa_id: empresa.id,
        invite_id: invite.id,
        expires_at: invite.expires_at,
        email_sent: emailSent,
      });
    } catch (innerErr: unknown) {
      // Rollback empresa
      await supabase.from("orbit_empresas").delete().eq("id", empresa.id);
      console.error("Erro interno:", innerErr);
      const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      return fail(ErrorCodes.INTERNAL_ERROR, `Erro interno: ${msg}`, 500);
    }
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return fail(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
});
