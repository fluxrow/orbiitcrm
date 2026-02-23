import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(ErrorCodes.UNAUTHORIZED, "Missing authorization", 401);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return fail(ErrorCodes.UNAUTHORIZED, "Unauthorized", 401);

    const { data: peUser } = await supabaseAdmin.from("pe_users").select("*, pe_roles(code)").eq("id", user.id).single();
    if (!peUser) return fail(ErrorCodes.FORBIDDEN, "User not found in pe_users", 403);

    const { organization_id, email, role_code, full_name, phone } = await req.json();

    const isSuperAdmin = peUser.is_super_admin;
    const isOrgAdmin = !isSuperAdmin && peUser.pe_roles?.code === "ORG_ADMIN" && peUser.organization_id === organization_id;
    if (!isSuperAdmin && !isOrgAdmin) return fail(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);

    const { data: role } = await supabaseAdmin.from("pe_roles").select("id").eq("code", role_code).single();
    if (!role) return fail(ErrorCodes.VALIDATION_ERROR, "Invalid role_code");

    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error: invError } = await supabaseAdmin.from("pe_invitations").insert({
      organization_id, email: email.toLowerCase().trim(), role_id: role.id,
      token, status: "pending", expires_at, invited_by_user_id: user.id,
    }).select().single();

    if (invError) return fail(ErrorCodes.INTERNAL_ERROR, invError.message, 500);

    await supabaseAdmin.from("pe_audit_log").insert({
      organization_id, actor_user_id: user.id, action: "INVITE_SENT",
      entity_type: "invitation", entity_id: invitation.id,
      metadata: { email, role_code, full_name, phone },
    });

    return ok({ invitation, token });
  } catch (err) {
    return fail(ErrorCodes.INTERNAL_ERROR, err.message, 500);
  }
});
