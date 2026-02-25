import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Get requester
    const { data: { user: requester }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !requester) return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);

    const body = await req.json();
    const { organization_id, email, password, full_name, role_code } = body;

    if (!organization_id || !email || !password || !role_code) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios: organization_id, email, password, role_code");
    }
    if (password.length < 6) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Senha deve ter pelo menos 6 caracteres");
    }

    // Check permissions: must be ORG_ADMIN of same org or super admin
    const { data: requesterPeUser } = await supabaseAdmin
      .from("pe_users")
      .select("organization_id, is_super_admin, role_id, pe_roles(code)")
      .eq("id", requester.id)
      .single();

    const isSuperAdmin = requesterPeUser?.is_super_admin === true;
    const isOrgAdmin = requesterPeUser?.organization_id === organization_id &&
      (requesterPeUser as any)?.pe_roles?.code === "ORG_ADMIN";

    if (!isSuperAdmin && !isOrgAdmin) {
      return fail(ErrorCodes.FORBIDDEN, "Sem permissão para adicionar usuários", 403);
    }

    // Check user limit via pe_tenant_map -> orbit_empresas
    const { data: tenantMap } = await supabaseAdmin
      .from("pe_tenant_map")
      .select("empresa_id")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (tenantMap?.empresa_id) {
      const { data: empresa } = await supabaseAdmin
        .from("orbit_empresas")
        .select("max_usuarios")
        .eq("id", tenantMap.empresa_id)
        .single();

      if (empresa?.max_usuarios) {
        const { count } = await supabaseAdmin
          .from("pe_users")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization_id)
          .eq("is_active", true);

        if (count !== null && count >= empresa.max_usuarios) {
          return fail(ErrorCodes.PLAN_LIMIT_REACHED, `Limite de usuários atingido (${count}/${empresa.max_usuarios})`);
        }
      }
    }

    // Resolve role_id from role_code
    const { data: role, error: roleErr } = await supabaseAdmin
      .from("pe_roles")
      .select("id")
      .eq("code", role_code)
      .single();

    if (roleErr || !role) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Papel (role_code) inválido");
    }

    // Create auth user
    const normalizedEmail = email.trim().toLowerCase();
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { nome: full_name || normalizedEmail.split("@")[0], full_name: full_name || normalizedEmail.split("@")[0] },
    });

    if (createErr) {
      const msg = createErr.message.includes("already been registered")
        ? "Este email já está cadastrado no sistema"
        : createErr.message;
      return fail(ErrorCodes.VALIDATION_ERROR, msg);
    }

    const userId = newUser.user.id;

    // Update pe_users (created by trigger handle_new_user_pe)
    // Small delay to ensure trigger has fired
    await new Promise((r) => setTimeout(r, 500));

    await supabaseAdmin
      .from("pe_users")
      .update({
        organization_id,
        role_id: role.id,
        full_name: full_name || normalizedEmail.split("@")[0],
        is_active: true,
      })
      .eq("id", userId);

    // Update profiles.empresa_id if tenant map exists
    if (tenantMap?.empresa_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ empresa_id: tenantMap.empresa_id })
        .eq("id", userId);
    }

    // Audit log
    await supabaseAdmin.from("pe_audit_log").insert({
      organization_id,
      actor_user_id: requester.id,
      action: "USER_ADDED_DIRECTLY",
      entity_type: "user",
      entity_id: userId,
      metadata: { email: normalizedEmail, role_code, full_name },
    });

    return ok({ user_id: userId, email: normalizedEmail });
  } catch (error) {
    return fail(ErrorCodes.INTERNAL_ERROR, error.message || "Erro interno", 500);
  }
});
