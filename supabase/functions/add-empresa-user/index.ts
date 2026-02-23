import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);
    const requesterId = claimsData.claims.sub as string;

    const body = await req.json();
    const { empresa_id, nome, email, senha, cargo, role } = body;

    if (!empresa_id || !nome || !email || !senha || !role) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios: empresa_id, nome, email, senha, role");
    }
    if (!["admin", "vendedor", "visualizador"].includes(role)) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Role inválido. Use: admin, vendedor, visualizador");
    }

    const { data: requesterRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", requesterId);
    const isSuperAdmin = requesterRoles?.some((r) => r.role === "super_admin");

    if (!isSuperAdmin) {
      const isAdmin = requesterRoles?.some((r) => r.role === "admin");
      if (!isAdmin) return fail(ErrorCodes.FORBIDDEN, "Sem permissão para adicionar usuários", 403);
      const { data: requesterProfile } = await supabaseAdmin.from("profiles").select("empresa_id").eq("id", requesterId).single();
      if (requesterProfile?.empresa_id !== empresa_id) return fail(ErrorCodes.FORBIDDEN, "Você só pode adicionar usuários à sua própria empresa", 403);
    }

    const { data: empresa, error: empresaError } = await supabaseAdmin.from("orbit_empresas").select("id, ativo, max_usuarios, nome").eq("id", empresa_id).single();
    if (empresaError || !empresa) return fail(ErrorCodes.NOT_FOUND, "Empresa não encontrada", 404);
    if (!empresa.ativo) return fail(ErrorCodes.VALIDATION_ERROR, "Empresa está inativa");

    const { count } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    if (count !== null && empresa.max_usuarios && count >= empresa.max_usuarios) {
      return fail(ErrorCodes.PLAN_LIMIT_REACHED, `Limite de usuários atingido (${count}/${empresa.max_usuarios})`);
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(), password: senha, email_confirm: true, user_metadata: { nome },
    });

    if (createError) {
      const msg = createError.message.includes("already been registered") ? "Este email já está cadastrado no sistema" : createError.message;
      return fail(ErrorCodes.VALIDATION_ERROR, msg);
    }

    const userId = newUser.user.id;
    await supabaseAdmin.from("profiles").update({ empresa_id, nome, cargo: cargo || null }).eq("id", userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });

    return ok({ user: { id: userId, nome, email: email.trim().toLowerCase(), cargo, role, empresa_id } });
  } catch (error) {
    return fail(ErrorCodes.INTERNAL_ERROR, error.message || "Erro interno", 500);
  }
});
