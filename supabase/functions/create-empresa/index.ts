import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

interface CreateEmpresaRequest {
  nome: string;
  cnpj?: string;
  email_contato?: string;
  telefone?: string;
  plano?: string;
  plano_saas?: string;
  max_usuarios?: number;
  data_expiracao?: string;
  admin_nome: string;
  admin_email: string;
  admin_senha: string;
}

function buildWelcomeEmailHtml(empresaNome: string, planName: string, adminNome: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <h1 style="color:#18181b;font-size:22px;margin:0 0 16px;">Bem-vindo ao Orbit CRM! 🚀</h1>
  <p style="color:#3f3f46;font-size:15px;line-height:1.6;">Olá <strong>${adminNome}</strong>,</p>
  <p style="color:#3f3f46;font-size:15px;line-height:1.6;">Sua empresa <strong>${empresaNome}</strong> foi criada com sucesso no plano <strong>${planName}</strong>.</p>
  <p style="color:#3f3f46;font-size:15px;line-height:1.6;">Você já pode fazer login e começar a usar o sistema.</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
  <p style="color:#71717a;font-size:13px;">Equipe Orbit CRM</p>
</div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);

    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin");
    if (!roles?.length) return fail(ErrorCodes.FORBIDDEN, "Acesso negado. Apenas super admins podem criar empresas.", 403);

    const body: CreateEmpresaRequest = await req.json();
    if (!body.nome || !body.admin_nome || !body.admin_email || !body.admin_senha) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios faltando");
    }

    const { data: empresa, error: empresaError } = await supabaseAdmin.from("orbit_empresas").insert({
      nome: body.nome, cnpj: body.cnpj, email_contato: body.email_contato, telefone: body.telefone,
      plano: body.plano || "trial", max_usuarios: body.max_usuarios || 5, data_expiracao: body.data_expiracao, ativo: true,
    }).select().single();

    if (empresaError) return fail(ErrorCodes.INTERNAL_ERROR, `Erro ao criar empresa: ${empresaError.message}`, 500);

    let provision = null;
    try {
      const { data: provisionData, error: provisionError } = await supabaseAdmin.rpc("pe_provision_tenant", {
        p_empresa_id: empresa.id, p_empresa_nome: empresa.nome, p_created_by_user_id: user.id,
      });
      if (provisionError) console.error("Error provisioning tenant:", provisionError);
      else provision = provisionData;
    } catch (e) { console.error("Exception provisioning tenant:", e); }

    // --- FASE 1: Padronização de Trial ---
    const planCode = body.plano_saas || "demo";
    const isPaid = ["basic", "professional", "plus"].includes(planCode);
    let planName = planCode;
    try {
      const { data: planRow } = await supabaseAdmin.from("saas_plans").select("id, name").eq("code", planCode).single();
      if (planRow) {
        planName = planRow.name;
        const now = new Date();
        const saasInsert: Record<string, unknown> = {
          empresa_id: empresa.id, plan_id: planRow.id, created_by_user_id: user.id,
          activated_at: now.toISOString(),
          status: isPaid ? "trial" : "active",
        };
        if (isPaid) {
          saasInsert.trial_ends_at = new Date(now.getTime() + 7 * 86400000).toISOString();
        }
        await supabaseAdmin.from("saas_empresa").insert(saasInsert);
      }
    } catch (e) { console.error("Exception creating saas_empresa:", e); }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.admin_email, password: body.admin_senha, email_confirm: true,
      user_metadata: { nome: body.admin_nome, empresa_id: empresa.id },
    });

    if (authError) {
      await supabaseAdmin.from("orbit_empresas").delete().eq("id", empresa.id);
      return fail(ErrorCodes.INTERNAL_ERROR, `Erro ao criar usuário: ${authError.message}`, 500);
    }

    await supabaseAdmin.from("profiles").update({ empresa_id: empresa.id, cargo: "Admin" }).eq("id", authUser.user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: authUser.user.id, role: "admin" });

    const defaultStages = [
      { nome: "Qualificação", ordem: 1, cor: "#3b82f6", empresa_id: empresa.id },
      { nome: "Proposta", ordem: 2, cor: "#8b5cf6", empresa_id: empresa.id },
      { nome: "Negociação", ordem: 3, cor: "#f59e0b", empresa_id: empresa.id },
      { nome: "Fechamento", ordem: 4, cor: "#06b6d4", empresa_id: empresa.id },
      { nome: "Ganho", ordem: 5, cor: "#22c55e", is_won: true, empresa_id: empresa.id },
      { nome: "Perdido", ordem: 6, cor: "#ef4444", is_lost: true, empresa_id: empresa.id },
    ];
    await supabaseAdmin.from("orbit_pipeline_stages").insert(defaultStages);
    await supabaseAdmin.from("orbit_ai_config").insert({
      empresa_id: empresa.id, modo_automatico: true, tom_conversa: "profissional e amigável",
      horario_inicio: "08:00", horario_fim: "18:00",
    });

    // --- Welcome Email ---
    try {
      await supabaseAdmin.from("pe_audit_log").insert({
        actor_user_id: user.id, action: "EMPRESA_ACTIVATED",
        entity_type: "orbit_empresas", entity_id: empresa.id,
        metadata: { empresa_id: empresa.id, plan_code: planCode, admin_email: body.admin_email },
      });

      const { data: existingEmail } = await supabaseAdmin
        .from("pe_audit_log")
        .select("id")
        .eq("action", "WELCOME_EMAIL_SENT")
        .eq("entity_id", empresa.id)
        .maybeSingle();

      if (!existingEmail) {
        const { apiKey, fromEmail } = await getSystemEmailConfig(supabaseAdmin);
        if (apiKey) {
          const emailHtml = buildWelcomeEmailHtml(empresa.nome, planName, body.admin_nome);
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: [body.admin_email],
              subject: `Bem-vindo ao Orbit CRM — ${empresa.nome}`,
              html: emailHtml,
            }),
          });
          if (resendRes.ok) {
            await supabaseAdmin.from("pe_audit_log").insert({
              actor_user_id: user.id, action: "WELCOME_EMAIL_SENT",
              entity_type: "orbit_empresas", entity_id: empresa.id,
              metadata: { email: body.admin_email, plan_code: planCode },
            });
            console.log("Welcome email sent to", body.admin_email);
          } else {
            console.error("Resend error:", await resendRes.text());
          }
        } else {
          console.warn("No Resend API key configured, skipping welcome email");
        }
      }
    } catch (e) { console.error("Exception sending welcome email:", e); }

    return ok({ empresa, user: { id: authUser.user.id, email: authUser.user.email }, provision });
  } catch (error) {
    console.error("Unexpected error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, "Erro interno do servidor", 500);
  }
});
