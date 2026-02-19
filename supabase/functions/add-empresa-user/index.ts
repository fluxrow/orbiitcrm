import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client with user's token for permission check
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client for user creation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify requester
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const requesterId = claimsData.claims.sub as string;

    const body = await req.json();
    const { empresa_id, nome, email, senha, cargo, role } = body;

    // Validate input
    if (!empresa_id || !nome || !email || !senha || !role) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: empresa_id, nome, email, senha, role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["admin", "vendedor", "visualizador"].includes(role)) {
      return new Response(
        JSON.stringify({ error: "Role inválido. Use: admin, vendedor, visualizador" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check permission: super_admin can add to any empresa, admin only to their own
    const { data: requesterRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requesterId);

    const isSuperAdmin = requesterRoles?.some((r) => r.role === "super_admin");

    if (!isSuperAdmin) {
      const isAdmin = requesterRoles?.some((r) => r.role === "admin");
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Sem permissão para adicionar usuários" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Admin can only add to their own empresa
      const { data: requesterProfile } = await supabaseAdmin
        .from("profiles")
        .select("empresa_id")
        .eq("id", requesterId)
        .single();

      if (requesterProfile?.empresa_id !== empresa_id) {
        return new Response(
          JSON.stringify({ error: "Você só pode adicionar usuários à sua própria empresa" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Verify empresa exists and is active
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("orbit_empresas")
      .select("id, ativo, max_usuarios, nome")
      .eq("id", empresa_id)
      .single();

    if (empresaError || !empresa) {
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!empresa.ativo) {
      return new Response(
        JSON.stringify({ error: "Empresa está inativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user limit
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresa_id);

    if (count !== null && empresa.max_usuarios && count >= empresa.max_usuarios) {
      return new Response(
        JSON.stringify({
          error: `Limite de usuários atingido (${count}/${empresa.max_usuarios})`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user
    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      });

    if (createError) {
      const msg = createError.message.includes("already been registered")
        ? "Este email já está cadastrado no sistema"
        : createError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // Update profile with empresa_id and cargo
    await supabaseAdmin
      .from("profiles")
      .update({ empresa_id, nome, cargo: cargo || null })
      .eq("id", userId);

    // Insert role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role,
    });

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          nome,
          email: email.trim().toLowerCase(),
          cargo,
          role,
          empresa_id,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
