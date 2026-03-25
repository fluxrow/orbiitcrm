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
  const fullUrl = `https://orbiitcrm.lovable.app${redirectUrl}`;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body: AcceptRequest = await req.json();

    if (!body.token || !body.password || !body.full_name?.trim()) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios faltando");
    }

    if (body.password.length < 6) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Senha deve ter pelo menos 6 caracteres");
    }

    const tokenHash = await hashToken(body.token);

    const { data: invite, error: invErr } = await supabase
      .from("saas_invites")
      .select("id, email, responsible_name, expires_at, used_at, empresa_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (invErr || !invite) return fail(ErrorCodes.INVITE_INVALID, "Convite não encontrado ou token inválido", 404);
    if (invite.used_at) return fail(ErrorCodes.INVITE_USED, "Este convite já foi utilizado", 410);
    if (new Date(invite.expires_at) < new Date()) return fail(ErrorCodes.INVITE_EXPIRED, "Este convite expirou", 410);

    const { data: saasEmpresa } = await supabase
      .from("saas_empresa")
      .select("plan_id, saas_plans(code, name)")
      .eq("empresa_id", invite.empresa_id)
      .single();

    const planCode = (saasEmpresa?.saas_plans as any)?.code || "demo";
    const planName = (saasEmpresa?.saas_plans as any)?.name || planCode;
    const isDemo = planCode === "demo";
    const isPaid = ["basic", "professional", "plus"].includes(planCode);

    let cnpjNormalized: string | null = null;
    if (!isDemo) {
      if (!body.cnpj) return fail(ErrorCodes.CNPJ_INVALID, "CNPJ é obrigatório para planos pagos");
      cnpjNormalized = body.cnpj.replace(/[^0-9]/g, "");
      if (cnpjNormalized.length !== 14) return fail(ErrorCodes.CNPJ_INVALID, "CNPJ deve ter 14 dígitos");

      const { data: existing } = await supabase
        .from("orbit_empresas")
        .select("id")
        .eq("cnpj_normalized", cnpjNormalized)
        .neq("id", invite.empresa_id)
        .maybeSingle();

      if (existing) return fail(ErrorCodes.CNPJ_ALREADY_EXISTS, "CNPJ já cadastrado em outra empresa", 409);
    }

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { nome: body.full_name.trim(), empresa_id: invite.empresa_id },
    });

    if (authErr) {
      console.error("Auth error:", authErr);
      return fail(ErrorCodes.INTERNAL_ERROR, `Erro ao criar usuário: ${authErr.message}`, 500);
    }

    const userId = authUser.user.id;

    await supabase.from("profiles").update({ empresa_id: invite.empresa_id, nome: body.full_name.trim(), cargo: "Admin" }).eq("id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });

    const empresaUpdate: Record<string, unknown> = { ativo: true };
    if (cnpjNormalized) empresaUpdate.cnpj = body.cnpj;
    if (body.dados_receita?.razao_social) empresaUpdate.nome = body.dados_receita.razao_social;
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
        await supabase.from("orbit_pipeline_stages").insert([
          { nome: "Qualificação", ordem: 1, cor: "#3b82f6", empresa_id: invite.empresa_id },
          { nome: "Proposta", ordem: 2, cor: "#8b5cf6", empresa_id: invite.empresa_id },
          { nome: "Negociação", ordem: 3, cor: "#f59e0b", empresa_id: invite.empresa_id },
          { nome: "Fechamento", ordem: 4, cor: "#06b6d4", empresa_id: invite.empresa_id },
          { nome: "Ganho", ordem: 5, cor: "#22c55e", is_won: true, empresa_id: invite.empresa_id },
          { nome: "Perdido", ordem: 6, cor: "#ef4444", is_lost: true, empresa_id: invite.empresa_id },
        ]);
      } catch (e) { console.error("Pipeline stages error:", e); }

      try {
        await supabase.from("orbit_ai_config").insert({
          empresa_id: invite.empresa_id, modo_automatico: true,
          tom_conversa: "profissional e amigável", horario_inicio: "08:00", horario_fim: "18:00",
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
    });
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return fail(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
});
