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

    // Check super_admin
    const { data: requesterRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", requesterId);
    const isSuperAdmin = requesterRoles?.some((r: any) => r.role === "super_admin");
    if (!isSuperAdmin) return fail(ErrorCodes.FORBIDDEN, "Apenas super admins podem alterar senhas", 403);

    const body = await req.json();
    const { user_id, password } = body;

    if (!user_id || !password) return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios: user_id, password");
    if (password.length < 6) return fail(ErrorCodes.VALIDATION_ERROR, "A senha deve ter pelo menos 6 caracteres");

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUser(user_id, { password });
    if (updateError) return fail(ErrorCodes.INTERNAL_ERROR, updateError.message, 500);

    return ok({ message: "Senha atualizada com sucesso" });
  } catch (error) {
    return fail(ErrorCodes.INTERNAL_ERROR, error.message || "Erro interno", 500);
  }
});
