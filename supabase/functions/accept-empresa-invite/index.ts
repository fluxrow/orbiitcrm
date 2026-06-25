import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// getResendApiKey removed — now using getSystemEmailConfig from _shared/system-email.ts

function buildActivationEmailHtml(empresaNome: string, planName: string, userName: string, redirectUrl: string): string {
  const appUrl = Deno.env.get("APP_URL") || "https://orbit.fluxrow.pro";
  const fullUrl = `${appUrl}${redirectUrl}`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <h1 style="color:#18181b;font-size:22px;margin:0 0 16px;">Conta ativada com sucesso! ✅</h1>
  <p style="color:#3f3f46;font-size:15px;line-height:1.6;">Olá <strong>${userName}</strong>,</p>
  <p style="color:#3f3f46;font-size:15px;line-height:1.6;">Sua conta na empresa <strong>${empresaNome}</strong> foi ativada no plano <strong>${planName}</strong>.</p>
  <p style="color:#3f3f46;font-size:15px;line-height:1.6;">Clique no botão abaixo para acessar seu painel:</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${fullUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">Acessar Dashboard</a>
  </div>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
  <p style="color:#71717a;font-size:13px;">Equipe Orbit CRM</p>
</div>
</body></html>`;
}

interface AcceptRequest {
  token: string;
  password: string;
  full_name: string;
  /** Documento unificado: CPF (11) ou CNPJ (14). Preferir este campo. */
  documento?: string;
  /** Compat: campo legado. */
  cnpj?: string;
  dados_receita?: {
    razao_social?: string;
    nome_fantasia?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cnae_fiscal_descricao?: string;
  };
}

function validateCpfDv(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let dv = (s * 10) % 11; if (dv === 10) dv = 0;
  if (dv !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  dv = (s * 10) % 11; if (dv === 10) dv = 0;
  return dv === parseInt(cpf[10]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body: AcceptRequest = await req.json();

    if (!body.token || !body.password || !body.full_name?.trim()) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios faltando", 400, undefined, req);
    }

    if (body.password.length < 6) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Senha deve ter pelo menos 6 caracteres", 400, undefined, req);
    }

    const tokenHash = await hashToken(body.token);

    const { data: invite, error: invErr } = await supabase
      .from("saas_invites")
      .select("id, email, responsible_name, expires_at, used_at, empresa_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (invErr || !invite) return fail(ErrorCodes.INVITE_INVALID, "Convite não encontrado ou token inválido", 404, undefined, req);
    if (invite.used_at) return fail(ErrorCodes.INVITE_USED, "Este convite já foi utilizado", 410, undefined, req);
    if (new Date(invite.expires_at) < new Date()) return fail(ErrorCodes.INVITE_EXPIRED, "Este convite expirou", 410, undefined, req);

    const { data: saasEmpresa } = await supabase
      .from("saas_empresa")
      .select("plan_id, saas_plans(code, name)")
      .eq("empresa_id", invite.empresa_id)
      .single();

    const planCode = (saasEmpresa?.saas_plans as any)?.code || "demo";
    const planName = (saasEmpresa?.saas_plans as any)?.name || planCode;
    const isDemo = planCode === "demo";
    const isPaid = ["basic", "professional", "plus"].includes(planCode);

    // Documento: aceita CPF (PF, 11 dígitos) ou CNPJ (PJ, 14 dígitos).
    // Compat: também aceita campo legado `cnpj`.
    let cnpjNormalized: string | null = null;
    let cpfNormalized: string | null = null;
    let tipoPessoa: "PF" | "PJ" | null = null;
    if (!isDemo) {
      const raw = (body.documento ?? body.cnpj ?? "").replace(/[^0-9]/g, "");
      if (!raw) return fail(ErrorCodes.VALIDATION_ERROR, "Documento (CPF ou CNPJ) é obrigatório", 400, undefined, req);

      if (raw.length === 11) {
        if (!validateCpfDv(raw)) return fail(ErrorCodes.VALIDATION_ERROR, "CPF inválido", 400, undefined, req);
        tipoPessoa = "PF";
        cpfNormalized = raw;
      } else if (raw.length === 14) {
        tipoPessoa = "PJ";
        cnpjNormalized = raw;
        const { data: existing } = await supabase
          .from("orbit_empresas")
          .select("id")
          .eq("cnpj_normalized", cnpjNormalized)
          .neq("id", invite.empresa_id)
          .maybeSingle();
        if (existing) return fail(ErrorCodes.CNPJ_ALREADY_EXISTS, "CNPJ já cadastrado em outra empresa", 409, undefined, req);
      } else {
        return fail(ErrorCodes.VALIDATION_ERROR, "Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos", 400, undefined, req);
      }
    }

    // Try to create the auth user; if email already exists, locate and reuse it
    // (prevents "usuário órfão" and lets the invite link an existing user to this empresa).
    let userId: string;
    let isExistingUser = false;
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { nome: body.full_name.trim(), empresa_id: invite.empresa_id },
    });

    if (authErr) {
      const msg = (authErr.message || "").toLowerCase();
      const alreadyExists = msg.includes("already") || msg.includes("registered") || msg.includes("exist");
      if (!alreadyExists) {
        console.error("Auth error:", authErr);
        return fail(ErrorCodes.INTERNAL_ERROR, `Erro ao criar usuário: ${authErr.message}`, 500, undefined, req);
      }

      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (listErr) {
        console.error("listUsers error:", listErr);
        return fail(ErrorCodes.INTERNAL_ERROR, `Não foi possível localizar o usuário existente: ${listErr.message}`, 500, undefined, req);
      }
      const existing = list.users.find((u) => (u.email || "").toLowerCase() === invite.email.toLowerCase());
      if (!existing) {
        return fail(ErrorCodes.INTERNAL_ERROR, "Email já registrado, mas usuário não localizado.", 500, undefined, req);
      }
      userId = existing.id;
      isExistingUser = true;
      // For existing users, DO NOT reset password nor overwrite user_metadata —
      // this is an additional tenant membership, not an account takeover.
      console.log("Linking existing auth user to empresa (profile preserved)", { userId, empresa_id: invite.empresa_id });
    } else {
      userId = authUser.user.id;
    }

    // HOTFIX F4.7: Only seed profile fields when this is a brand-new user.
    // Existing users (e.g. Super Admin being invited to another tenant) keep their
    // current profiles.empresa_id / nome / cargo — multi-tenant access is granted
    // exclusively via user_empresa_memberships and resolved at runtime by TenantContext
    // (which calls switch_active_empresa based on the URL slug).
    if (!isExistingUser) {
      await supabase.from("profiles").update({ empresa_id: invite.empresa_id, nome: body.full_name.trim(), cargo: "Admin" }).eq("id", userId);
    }

    // Idempotent: avoid duplicate (user_id, role) violations when relinking an existing user.
    const { data: hasRole } = await supabase.from("user_roles").select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!hasRole) {
      await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    }
    await supabase.from("user_empresa_memberships").upsert(
      { user_id: userId, empresa_id: invite.empresa_id, role: "admin" },
      { onConflict: "user_id,empresa_id" },
    );

    const empresaUpdate: Record<string, unknown> = { ativo: true };
    if (cnpjNormalized) empresaUpdate.cnpj = cnpjNormalized;
    if (cpfNormalized) empresaUpdate.cnpj = cpfNormalized; // armazena CPF no mesmo campo `cnpj` (texto livre); coluna cnpj_normalized é gerada apenas para CNPJ.
    // NÃO sobrescrever `nome`: o nome amigável foi definido no convite e deve ser preservado.
    await supabase.from("orbit_empresas").update(empresaUpdate).eq("id", invite.empresa_id);

    // Trial/activation logic
    const now = new Date();
    const saasUpdate: Record<string, unknown> = { activated_at: now.toISOString() };

    if (isPaid) {
      saasUpdate.status = "trial";
      saasUpdate.trial_ends_at = new Date(now.getTime() + 7 * 86400000).toISOString();
    } else {
      saasUpdate.status = "active";
    }

    await supabase.from("saas_empresa").update(saasUpdate).eq("empresa_id", invite.empresa_id);

    await supabase.from("saas_invites").update({ used_at: new Date().toISOString(), used_by_user_id: userId }).eq("id", invite.id);

    let organizationId: string | null = null;
    if (!isDemo) {
      try {
        const { data: provisionData } = await supabase.rpc("pe_provision_tenant", {
          p_empresa_id: invite.empresa_id,
          p_empresa_nome: body.dados_receita?.razao_social || body.full_name.trim(),
          p_created_by_user_id: userId,
        });
        organizationId = provisionData?.organization_id || null;
      } catch (e) { console.error("PE provision error:", e); }

      try {
        await supabase.rpc("create_default_pipeline_stages", {
          p_empresa_id: invite.empresa_id,
        });
      } catch (e) { console.error("Pipeline stages error:", e); }

      try {
        await supabase.from("orbit_ai_config").upsert({
          empresa_id: invite.empresa_id, modo_automatico: true,
          tom_conversa: "profissional e amigável", horario_inicio: "08:00", horario_fim: "18:00",
        }, {
          onConflict: "empresa_id",
        });
      } catch (e) { console.error("AI config error:", e); }
    }

    // Generate slug for paid plans
    let slug: string | null = null;
    if (isPaid) {
      try {
        const empresaNome = body.dados_receita?.razao_social || body.dados_receita?.nome_fantasia || body.full_name.trim();
        const { data: slugData } = await supabase.rpc("generate_unique_slug", { p_nome: empresaNome });
        if (slugData) {
          slug = slugData as string;
          await supabase.from("orbit_empresas").update({
            slug,
            public_url: `https://orbit.fluxrow.pro/${slug}`,
            slug_created_at: new Date().toISOString(),
          }).eq("id", invite.empresa_id);
        }
      } catch (e) { console.error("Slug generation error:", e); }
    }

    await supabase.from("pe_audit_log").insert({
      actor_user_id: userId, action: "EMPRESA_ACTIVATED",
      entity_type: "orbit_empresas", entity_id: invite.empresa_id,
      metadata: { empresa_id: invite.empresa_id, plan_code: planCode, is_demo: isDemo, invite_id: invite.id, slug },
    });

    const redirectUrl = slug ? `/${slug}/dashboard` : "/demo/dashboard";

    // --- FASE 2B: Activation Email ---
    try {
      const { data: existingEmail } = await supabase
        .from("pe_audit_log")
        .select("id")
        .eq("action", "WELCOME_EMAIL_SENT")
        .eq("entity_id", invite.empresa_id)
        .maybeSingle();

      if (!existingEmail) {
        const empresaNome = body.dados_receita?.razao_social || body.full_name.trim();
        const { apiKey, fromEmail } = await getSystemEmailConfig(supabase);
        if (apiKey) {
          const emailHtml = buildActivationEmailHtml(empresaNome, planName, body.full_name.trim(), redirectUrl);
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: [invite.email],
              subject: `Conta ativada — ${empresaNome}`,
              html: emailHtml,
            }),
          });
          if (resendRes.ok) {
            await supabase.from("pe_audit_log").insert({
              actor_user_id: userId, action: "WELCOME_EMAIL_SENT",
              entity_type: "orbit_empresas", entity_id: invite.empresa_id,
              metadata: { email: invite.email, plan_code: planCode, slug },
            });
            console.log("Activation email sent to", invite.email);
          } else {
            console.error("Resend error:", await resendRes.text());
          }
        } else {
          console.warn("No Resend API key configured, skipping activation email");
        }
      }
    } catch (e) { console.error("Exception sending activation email:", e); }

    return ok({
      empresa_id: invite.empresa_id,
      user_id: userId,
      organization_id: organizationId,
      plan_code: planCode,
      status: isPaid ? "trial" : "active",
      slug,
      redirect_url: redirectUrl,
    }, undefined, req);
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return fail(ErrorCodes.INTERNAL_ERROR, msg, 500, undefined, req);
  }
});
