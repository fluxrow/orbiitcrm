import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  empresa_nome: string;
  responsible_name: string;
  responsible_email: string;
  plan_code: "demo" | "basic" | "professional" | "plus";
}

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getAppUrl(req: Request): string {
  const envUrl = Deno.env.get("APP_URL");
  if (envUrl) return envUrl.replace(/\/$/, "");
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (origin) {
    try {
      const u = new URL(origin);
      return u.origin;
    } catch { /* ignore */ }
  }
  return "https://id-preview--143c37b1-339e-469f-b2f1-df4584af8003.lovable.app";
}

async function getResendApiKey(
  supabase: ReturnType<typeof createClient>,
): Promise<{ apiKey: string | null; fromEmail: string }> {
  let apiKey: string | null = null;
  let fromEmail = "Orbit <onboarding@resend.dev>";

  // Try global config (empresa_id IS NULL)
  const { data: cfg } = await supabase
    .from("orbit_resend_config")
    .select("*")
    .is("empresa_id", null)
    .maybeSingle();

  if (cfg) {
    if (cfg.api_key) apiKey = cfg.api_key;
    if (cfg.ativo && cfg.from_email) {
      fromEmail = `${cfg.from_name || "Orbit"} <${cfg.from_email}>`;
    }
  }

  if (!apiKey) apiKey = Deno.env.get("RESEND_API_KEY") || null;

  return { apiKey, fromEmail };
}

function buildEmailHtml(
  empresaNome: string,
  planName: string,
  activationUrl: string,
): string {
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
    <h2 style="margin:0 0 16px;color:#1a1a2e;">Você foi convidado!</h2>
    <p style="color:#555;line-height:1.6;">
      A empresa <strong>${empresaNome}</strong> foi pré-cadastrada para você no plano <strong>${planName}</strong>.
    </p>
    <p style="color:#555;line-height:1.6;">
      Clique no botão abaixo para ativar sua conta e começar a usar a plataforma.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td align="center">
        <a href="${activationUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">
          Ativar Minha Conta
        </a>
      </td></tr>
    </table>
    <p style="color:#999;font-size:13px;">Este link expira em 48 horas.</p>
    <p style="color:#ccc;font-size:12px;margin-top:24px;">Se você não solicitou este convite, ignore este e-mail.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Auth — validate super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: "Token inválido" }, 401);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin");
    if (!roles?.length)
      return json({ error: "Acesso negado. Apenas super admins." }, 403);

    // 2. Parse & validate body
    const body: InviteRequest = await req.json();
    if (
      !body.empresa_nome?.trim() ||
      !body.responsible_name?.trim() ||
      !body.responsible_email?.trim() ||
      !body.plan_code
    )
      return json({ error: "Campos obrigatórios faltando" }, 400);

    const validPlans = ["demo", "basic", "professional", "plus"];
    if (!validPlans.includes(body.plan_code))
      return json({ error: "plan_code inválido" }, 400);

    // 3. Buscar plan_id
    const { data: plan } = await supabase
      .from("saas_plans")
      .select("id, name")
      .eq("code", body.plan_code)
      .single();
    if (!plan) return json({ error: "Plano não encontrado" }, 400);

    // 4. Criar orbit_empresas (ativo=false)
    const { data: empresa, error: empErr } = await supabase
      .from("orbit_empresas")
      .insert({ nome: body.empresa_nome.trim(), ativo: false })
      .select()
      .single();
    if (empErr)
      return json({ error: `Erro ao criar empresa: ${empErr.message}` }, 500);

    try {
      // 5. Upsert saas_empresa
      const { error: saasErr } = await supabase.from("saas_empresa").insert({
        empresa_id: empresa.id,
        plan_id: plan.id,
        status: "invited",
        responsible_name: body.responsible_name.trim(),
        responsible_email: body.responsible_email.trim().toLowerCase(),
        invited_at: new Date().toISOString(),
        created_by_user_id: user.id,
      });
      if (saasErr) throw new Error(`saas_empresa: ${saasErr.message}`);

      // 6. Invalidar convites anteriores para o mesmo email
      await supabase
        .from("saas_invites")
        .update({ expires_at: new Date().toISOString() })
        .eq("email", body.responsible_email.trim().toLowerCase())
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString());

      // 7. Gerar token seguro
      const tokenPlaintext = generateToken();
      const tokenHash = await hashToken(tokenPlaintext);

      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      // 8. Inserir saas_invites
      const { data: invite, error: invErr } = await supabase
        .from("saas_invites")
        .insert({
          empresa_id: empresa.id,
          email: body.responsible_email.trim().toLowerCase(),
          responsible_name: body.responsible_name.trim(),
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_by_user_id: user.id,
        })
        .select("id, expires_at")
        .single();
      if (invErr) throw new Error(`saas_invites: ${invErr.message}`);

      // 9. Enviar email via Resend
      const { apiKey: resendKey, fromEmail } = await getResendApiKey(supabase);
      if (!resendKey) {
        console.warn("RESEND_API_KEY não configurada — email não enviado");
      } else {
        const appUrl = getAppUrl(req);
        const activationUrl = `${appUrl}/accept-invite?token=${tokenPlaintext}`;
        const emailHtml = buildEmailHtml(body.empresa_nome.trim(), plan.name, activationUrl);

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [body.responsible_email.trim()],
            subject: `Convite: ative sua empresa ${body.empresa_nome.trim()} no Orbit`,
            html: emailHtml,
          }),
        });

        if (!emailRes.ok) {
          const err = await emailRes.json();
          console.error("Erro Resend:", err);
        }
      }

      // 10. Audit log
      await supabase.from("pe_audit_log").insert({
        actor_user_id: user.id,
        action: "EMPRESA_INVITED",
        entity_type: "saas_invites",
        entity_id: invite.id,
        metadata: {
          empresa_id: empresa.id,
          email: body.responsible_email.trim().toLowerCase(),
          plan_code: body.plan_code,
        },
      });

      return json({
        empresa_id: empresa.id,
        invite_id: invite.id,
        expires_at: invite.expires_at,
      });
    } catch (innerErr: unknown) {
      // Rollback empresa on failure
      await supabase.from("orbit_empresas").delete().eq("id", empresa.id);
      console.error("Erro interno:", innerErr);
      const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      return json({ error: `Erro interno: ${msg}` }, 500);
    }
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
