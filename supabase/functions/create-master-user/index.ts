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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if super_admin already exists
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("role", "super_admin")
      .limit(1);

    if (checkError) {
      console.error("Error checking existing admins:", checkError);
      throw new Error("Erro ao verificar administradores existentes");
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: "Super Admin já existe no sistema" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, nome } = await req.json();

    if (!email || !password || !nome) {
      return new Response(
        JSON.stringify({ error: "Email, senha e nome são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user in auth.users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (authError) {
      console.error("Error creating auth user:", authError);
      throw new Error(authError.message);
    }

    const userId = authData.user.id;

    // Update profile (trigger already creates it, we just update)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nome,
        email,
        cargo: "Super Administrador",
        empresa_id: null, // Super Admin doesn't belong to any company
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // Continue anyway, profile was created by trigger
    }

    // Assign super_admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "super_admin",
      });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      // Try to cleanup - delete the user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("Erro ao atribuir role de super admin");
    }

    console.log(`Master Super Admin created successfully: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Super Admin Master criado com sucesso!",
        userId 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in create-master-user:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
