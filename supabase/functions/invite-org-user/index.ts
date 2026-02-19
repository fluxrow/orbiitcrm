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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check permissions: must be SUPER_ADMIN or ORG_ADMIN of the target org
    const { data: peUser } = await supabaseAdmin
      .from("pe_users")
      .select("*, pe_roles(code)")
      .eq("id", user.id)
      .single();

    if (!peUser) {
      return new Response(JSON.stringify({ error: "User not found in pe_users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { organization_id, email, role_code, full_name, phone } = await req.json();

    const isSuperAdmin = peUser.is_super_admin;
    const isOrgAdmin = !isSuperAdmin && peUser.pe_roles?.code === "ORG_ADMIN" && peUser.organization_id === organization_id;

    if (!isSuperAdmin && !isOrgAdmin) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup role_id by code
    const { data: role } = await supabaseAdmin
      .from("pe_roles")
      .select("id")
      .eq("code", role_code)
      .single();

    if (!role) {
      return new Response(JSON.stringify({ error: "Invalid role_code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error: invError } = await supabaseAdmin
      .from("pe_invitations")
      .insert({
        organization_id,
        email: email.toLowerCase().trim(),
        role_id: role.id,
        token,
        status: "pending",
        expires_at,
        invited_by_user_id: user.id,
      })
      .select()
      .single();

    if (invError) {
      return new Response(JSON.stringify({ error: invError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await supabaseAdmin.from("pe_audit_log").insert({
      organization_id,
      actor_user_id: user.id,
      action: "INVITE_SENT",
      entity_type: "invitation",
      entity_id: invitation.id,
      metadata: { email, role_code, full_name, phone },
    });

    return new Response(JSON.stringify({ invitation, token }), {
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
