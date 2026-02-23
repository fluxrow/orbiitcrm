import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    const isDemo = planCode === "demo";

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

    const now = new Date();
    const saasUpdate: Record<string, unknown> = { status: "active", activated_at: now.toISOString() };
    if (!isDemo) {
      const trialDays = planCode === "plus" ? 30 : 14;
      saasUpdate.trial_ends_at = new Date(now.getTime() + trialDays * 86400000).toISOString();
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

    await supabase.from("pe_audit_log").insert({
      actor_user_id: userId, action: "EMPRESA_ACTIVATED",
      entity_type: "orbit_empresas", entity_id: invite.empresa_id,
      metadata: { empresa_id: invite.empresa_id, plan_code: planCode, is_demo: isDemo, invite_id: invite.id },
    });

    return ok({
      empresa_id: invite.empresa_id,
      user_id: userId,
      organization_id: organizationId,
      plan_code: planCode,
      status: "active",
    });
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return fail(ErrorCodes.INTERNAL_ERROR, msg, 500);
  }
});
