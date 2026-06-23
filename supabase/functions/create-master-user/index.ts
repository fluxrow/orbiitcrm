import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: existingAdmins, error: checkError } = await supabaseAdmin.from("user_roles").select("id").eq("role", "super_admin").limit(1);
    if (checkError) throw new Error("Erro ao verificar administradores existentes");
    if (existingAdmins && existingAdmins.length > 0) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Super Admin já existe no sistema", 400, undefined, req);
    }

    const { email, password, nome } = await req.json();
    if (!email || !password || !nome) return fail(ErrorCodes.VALIDATION_ERROR, "Email, senha e nome são obrigatórios", 400, undefined, req);
    if (password.length < 6) return fail(ErrorCodes.VALIDATION_ERROR, "Senha deve ter no mínimo 6 caracteres", 400, undefined, req);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nome },
    });
    if (authError) throw new Error(authError.message);

    const userId = authData.user.id;
    await supabaseAdmin.from("profiles").update({ nome, email, cargo: "Super Administrador", empresa_id: null }).eq("id", userId);

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "super_admin" });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("Erro ao atribuir role de super admin");
    }

    console.log(`Master Super Admin created successfully: ${email}`);
    return ok({ message: "Super Admin Master criado com sucesso!", userId }, undefined, req);
  } catch (error: unknown) {
    console.error("Error in create-master-user:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, "internal_error", 500, undefined, req);
  }
});
