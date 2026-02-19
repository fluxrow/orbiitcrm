import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { token, password, full_name } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("pe_invitations")
      .select("*, organizations(name), pe_roles(code, name)")
      .eq("token", token)
      .single();

    if (invError || !invitation) {
      return new Response(JSON.stringify({ error: "Invalid invitation token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invitation.status !== "pending") {
      return new Response(JSON.stringify({ error: `Invitation already ${invitation.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabaseAdmin.from("pe_invitations").update({ status: "expired" }).eq("id", invitation.id);
      return new Response(JSON.stringify({ error: "Invitation has expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === invitation.email.toLowerCase()
    );

    let userId: string;

    if (!existingAuthUser) {
      // Create new auth user
      if (!password) {
        return new Response(JSON.stringify({ error: "Password is required for new users" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || invitation.email.split("@")[0] },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user.id;

      // The trigger will auto-create pe_users, but without org/role. Update it.
      // Small delay to let trigger fire
      await new Promise((r) => setTimeout(r, 500));

      await supabaseAdmin
        .from("pe_users")
        .update({
          organization_id: invitation.organization_id,
          role_id: invitation.role_id,
          full_name: full_name || invitation.email.split("@")[0],
          is_active: true,
        })
        .eq("id", userId);
    } else {
      userId = existingAuthUser.id;

      // Check pe_users
      const { data: peUser } = await supabaseAdmin
        .from("pe_users")
        .select("*")
        .eq("id", userId)
        .single();

      if (peUser?.is_super_admin) {
        return new Response(JSON.stringify({ error: "Super admin cannot accept org invitations" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (peUser?.organization_id && peUser.organization_id !== invitation.organization_id) {
        return new Response(JSON.stringify({ error: "User already belongs to another organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (peUser) {
        await supabaseAdmin
          .from("pe_users")
          .update({
            organization_id: invitation.organization_id,
            role_id: invitation.role_id,
            is_active: true,
            full_name: full_name || peUser.full_name,
          })
          .eq("id", userId);
      } else {
        // pe_users record doesn't exist yet
        await supabaseAdmin.from("pe_users").insert({
          id: userId,
          email: invitation.email,
          full_name: full_name || existingAuthUser.email?.split("@")[0] || "User",
          organization_id: invitation.organization_id,
          role_id: invitation.role_id,
          is_active: true,
          is_super_admin: false,
        });
      }
    }

    // Mark invitation as accepted
    await supabaseAdmin
      .from("pe_invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id);

    // Audit log
    await supabaseAdmin.from("pe_audit_log").insert({
      organization_id: invitation.organization_id,
      actor_user_id: userId,
      action: "INVITE_ACCEPTED",
      entity_type: "invitation",
      entity_id: invitation.id,
      metadata: { email: invitation.email },
    });

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
