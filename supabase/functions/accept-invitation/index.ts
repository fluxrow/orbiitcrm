import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { token, password, full_name, preview } = await req.json();
    if (!token) return fail(ErrorCodes.VALIDATION_ERROR, "Token is required");

    const { data: invitation, error: invError } = await supabaseAdmin
      .from("pe_invitations")
      .select("*, organizations(name), pe_roles(code, name)")
      .eq("token", token)
      .single();

    if (invError || !invitation) return fail(ErrorCodes.INVITE_INVALID, "Invalid invitation token", 404);
    if (invitation.status !== "pending") return fail(ErrorCodes.INVITE_USED, `Invitation already ${invitation.status}`, 410);

    if (new Date(invitation.expires_at) < new Date()) {
      await supabaseAdmin.from("pe_invitations").update({ status: "expired" }).eq("id", invitation.id);
      return fail(ErrorCodes.INVITE_EXPIRED, "Invitation has expired", 410);
    }

    // Preview mode: return invitation data without accepting
    if (preview) {
      return ok({
        email: invitation.email,
        organization_name: invitation.organizations?.name,
        role_name: invitation.pe_roles?.name,
        role_code: invitation.pe_roles?.code,
        status: invitation.status,
        expires_at: invitation.expires_at,
      });
    }

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === invitation.email.toLowerCase()
    );

    let userId: string;

    if (!existingAuthUser) {
      if (!password) return fail(ErrorCodes.VALIDATION_ERROR, "Password is required for new users");

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: invitation.email, password, email_confirm: true,
        user_metadata: { full_name: full_name || invitation.email.split("@")[0] },
      });

      if (createError) return fail(ErrorCodes.INTERNAL_ERROR, createError.message, 500);
      userId = newUser.user.id;

      await new Promise((r) => setTimeout(r, 500));
      await supabaseAdmin.from("pe_users").update({
        organization_id: invitation.organization_id, role_id: invitation.role_id,
        full_name: full_name || invitation.email.split("@")[0], is_active: true,
      }).eq("id", userId);
    } else {
      userId = existingAuthUser.id;
      const { data: peUser } = await supabaseAdmin.from("pe_users").select("*").eq("id", userId).single();

      if (peUser?.is_super_admin) return fail(ErrorCodes.FORBIDDEN, "Super admin cannot accept org invitations", 403);
      if (peUser?.organization_id && peUser.organization_id !== invitation.organization_id) {
        return fail(ErrorCodes.FORBIDDEN, "User already belongs to another organization", 403);
      }

      if (peUser) {
        await supabaseAdmin.from("pe_users").update({
          organization_id: invitation.organization_id, role_id: invitation.role_id,
          is_active: true, full_name: full_name || peUser.full_name,
        }).eq("id", userId);
      } else {
        await supabaseAdmin.from("pe_users").insert({
          id: userId, email: invitation.email,
          full_name: full_name || existingAuthUser.email?.split("@")[0] || "User",
          organization_id: invitation.organization_id, role_id: invitation.role_id,
          is_active: true, is_super_admin: false,
        });
      }
    }

    await supabaseAdmin.from("pe_invitations").update({ status: "accepted" }).eq("id", invitation.id);

    // Set profiles.empresa_id via pe_tenant_map so login redirect works
    const { data: tenantMap } = await supabaseAdmin
      .from("pe_tenant_map")
      .select("empresa_id")
      .eq("organization_id", invitation.organization_id)
      .maybeSingle();

    if (tenantMap?.empresa_id) {
      await supabaseAdmin.from("profiles")
        .update({ empresa_id: tenantMap.empresa_id })
        .eq("id", userId);
      await supabaseAdmin.from("user_empresa_memberships").upsert(
        { user_id: userId, empresa_id: tenantMap.empresa_id, role: "member" },
        { onConflict: "user_id,empresa_id" },
      );
    }

    await supabaseAdmin.from("pe_audit_log").insert({
      organization_id: invitation.organization_id, actor_user_id: userId,
      action: "INVITE_ACCEPTED", entity_type: "invitation", entity_id: invitation.id,
      metadata: { email: invitation.email },
    });

    return ok({ userId });
  } catch (err) {
    return fail(ErrorCodes.INTERNAL_ERROR, err.message, 500);
  }
});
