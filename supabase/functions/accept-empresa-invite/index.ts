import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface DadosReceita {
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cnae_fiscal_descricao?: string;
}

interface AcceptRequest {
  token: string;
  password: string;
  full_name: string;
  cnpj?: string;
  dados_receita?: DadosReceita;
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

    const body: AcceptRequest = await req.json();

    if (!body.token || !body.password || !body.full_name?.trim()) {
      return json({ error: "Campos obrigatórios faltando" }, 400);
    }

    if (body.password.length < 6) {
      return json({ error: "Senha deve ter pelo menos 6 caracteres" }, 400);
    }

    // 1. Validate token
    const tokenHash = await hashToken(body.token);

    const { data: invite, error: invErr } = await supabase
      .from("saas_invites")
      .select("id, email, responsible_name, expires_at, used_at, empresa_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (invErr || !invite) {
      return json({ error: "Convite não encontrado ou token inválido" }, 404);
    }

    if (invite.used_at) {
      return json({ error: "Este convite já foi utilizado" }, 410);
    }

    if (new Date(invite.expires_at) < new Date()) {
      return json({ error: "Este convite expirou" }, 410);
    }

    // 2. Get plan info
    const { data: saasEmpresa } = await supabase
      .from("saas_empresa")
      .select("plan_id, saas_plans(code, name)")
      .eq("empresa_id", invite.empresa_id)
      .single();

    const planCode = (saasEmpresa?.saas_plans as any)?.code || "demo";
    const isDemo = planCode === "demo";

    // 3. Validate CNPJ if not demo
    let cnpjNormalized: string | null = null;
    if (!isDemo) {
      if (!body.cnpj) {
        return json({ error: "CNPJ é obrigatório para planos pagos" }, 400);
      }
      cnpjNormalized = body.cnpj.replace(/[^0-9]/g, "");
      if (cnpjNormalized.length !== 14) {
        return json({ error: "CNPJ deve ter 14 dígitos" }, 400);
      }

      // Check uniqueness
      const { data: existing } = await supabase
        .from("orbit_empresas")
        .select("id")
        .eq("cnpj_normalized", cnpjNormalized)
        .neq("id", invite.empresa_id)
        .maybeSingle();

      if (existing) {
        return json({ error: "CNPJ já cadastrado em outra empresa" }, 409);
      }
    }

    // 4. Create auth user
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        nome: body.full_name.trim(),
        empresa_id: invite.empresa_id,
      },
    });

    if (authErr) {
      console.error("Auth error:", authErr);
      return json({ error: `Erro ao criar usuário: ${authErr.message}` }, 500);
    }

    const userId = authUser.user.id;

    // 5. Update profile (created by trigger) with empresa_id
    await supabase
      .from("profiles")
      .update({
        empresa_id: invite.empresa_id,
        nome: body.full_name.trim(),
        cargo: "Admin",
      })
      .eq("id", userId);

    // 6. Assign admin role
    await supabase.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    // 7. Update orbit_empresas
    const empresaUpdate: Record<string, unknown> = { ativo: true };
    if (cnpjNormalized) {
      empresaUpdate.cnpj = body.cnpj;
    }
    if (body.dados_receita?.razao_social) {
      empresaUpdate.nome = body.dados_receita.razao_social;
    }
    await supabase
      .from("orbit_empresas")
      .update(empresaUpdate)
      .eq("id", invite.empresa_id);

    // 8. Update saas_empresa with trial calculation
    const now = new Date();
    const saasUpdate: Record<string, unknown> = {
      status: "active",
      activated_at: now.toISOString(),
    };
    if (!isDemo) {
      const trialDays = planCode === "plus" ? 30 : 14;
      const trialEnd = new Date(now.getTime() + trialDays * 86400000);
      saasUpdate.trial_ends_at = trialEnd.toISOString();
    }
    await supabase
      .from("saas_empresa")
      .update(saasUpdate)
      .eq("empresa_id", invite.empresa_id);

    // 9. Mark invite as used
    await supabase
      .from("saas_invites")
      .update({
        used_at: new Date().toISOString(),
        used_by_user_id: userId,
      })
      .eq("id", invite.id);

    // 10. Provisioning (non-demo only)
    let organizationId: string | null = null;
    if (!isDemo) {
      // PE tenant
      try {
        const { data: provisionData } = await supabase.rpc("pe_provision_tenant", {
          p_empresa_id: invite.empresa_id,
          p_empresa_nome: body.dados_receita?.razao_social || body.full_name.trim(),
          p_created_by_user_id: userId,
        });
        organizationId = provisionData?.organization_id || null;
      } catch (e) {
        console.error("PE provision error:", e);
      }

      // Pipeline stages
      try {
        const defaultStages = [
          { nome: "Qualificação", ordem: 1, cor: "#3b82f6", empresa_id: invite.empresa_id },
          { nome: "Proposta", ordem: 2, cor: "#8b5cf6", empresa_id: invite.empresa_id },
          { nome: "Negociação", ordem: 3, cor: "#f59e0b", empresa_id: invite.empresa_id },
          { nome: "Fechamento", ordem: 4, cor: "#06b6d4", empresa_id: invite.empresa_id },
          { nome: "Ganho", ordem: 5, cor: "#22c55e", is_won: true, empresa_id: invite.empresa_id },
          { nome: "Perdido", ordem: 6, cor: "#ef4444", is_lost: true, empresa_id: invite.empresa_id },
        ];
        await supabase.from("orbit_pipeline_stages").insert(defaultStages);
      } catch (e) {
        console.error("Pipeline stages error:", e);
      }

      // AI config
      try {
        await supabase.from("orbit_ai_config").insert({
          empresa_id: invite.empresa_id,
          modo_automatico: true,
          tom_conversa: "profissional e amigável",
          horario_inicio: "08:00",
          horario_fim: "18:00",
        });
      } catch (e) {
        console.error("AI config error:", e);
      }
    }

    // 11. Audit log
    await supabase.from("pe_audit_log").insert({
      actor_user_id: userId,
      action: "EMPRESA_ACTIVATED",
      entity_type: "orbit_empresas",
      entity_id: invite.empresa_id,
      metadata: {
        empresa_id: invite.empresa_id,
        plan_code: planCode,
        is_demo: isDemo,
        invite_id: invite.id,
      },
    });

    return json({
      success: true,
      empresa_id: invite.empresa_id,
      user_id: userId,
      organization_id: organizationId,
      plan_code: planCode,
      status: "active",
    });
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
