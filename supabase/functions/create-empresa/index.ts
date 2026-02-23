import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

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

    const planCode = body.plano_saas || "demo";
    try {
      const { data: planRow } = await supabaseAdmin.from("saas_plans").select("id").eq("code", planCode).single();
      if (planRow) {
        await supabaseAdmin.from("saas_empresa").insert({
          empresa_id: empresa.id, plan_id: planRow.id, status: "active", created_by_user_id: user.id,
        });
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

    return ok({ empresa, user: { id: authUser.user.id, email: authUser.user.email }, provision });
  } catch (error) {
    console.error("Unexpected error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, "Erro interno do servidor", 500);
  }
});
