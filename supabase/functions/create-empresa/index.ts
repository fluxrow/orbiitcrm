import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateEmpresaRequest {
  nome: string;
  cnpj?: string;
  email_contato?: string;
  telefone?: string;
  plano?: string;
  max_usuarios?: number;
  data_expiracao?: string;
  admin_nome: string;
  admin_email: string;
  admin_senha: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requester is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has super_admin role
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin");

    if (rolesError || !roles?.length) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas super admins podem criar empresas." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: CreateEmpresaRequest = await req.json();

    // Validate required fields
    if (!body.nome || !body.admin_nome || !body.admin_email || !body.admin_senha) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios faltando" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create the empresa
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("orbit_empresas")
      .insert({
        nome: body.nome,
        cnpj: body.cnpj,
        email_contato: body.email_contato,
        telefone: body.telefone,
        plano: body.plano || "trial",
        max_usuarios: body.max_usuarios || 5,
        data_expiracao: body.data_expiracao,
        ativo: true,
      })
      .select()
      .single();

    if (empresaError) {
      console.error("Error creating empresa:", empresaError);
      return new Response(
        JSON.stringify({ error: `Erro ao criar empresa: ${empresaError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create the admin user in auth.users
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.admin_email,
      password: body.admin_senha,
      email_confirm: true,
      user_metadata: {
        nome: body.admin_nome,
        empresa_id: empresa.id,
      },
    });

    if (authError) {
      // Rollback: delete the empresa
      await supabaseAdmin.from("orbit_empresas").delete().eq("id", empresa.id);
      console.error("Error creating user:", authError);
      return new Response(
        JSON.stringify({ error: `Erro ao criar usuário: ${authError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Update the profile with empresa_id (profile is created by trigger)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        empresa_id: empresa.id,
        cargo: "Admin",
      })
      .eq("id", authUser.user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
    }

    // 4. Add admin role to user_roles
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: authUser.user.id,
        role: "admin",
      });

    if (roleError) {
      console.error("Error adding role:", roleError);
    }

    // 5. Create default pipeline stages for the empresa
    const defaultStages = [
      { nome: "Qualificação", ordem: 1, cor: "#3b82f6", empresa_id: empresa.id },
      { nome: "Proposta", ordem: 2, cor: "#8b5cf6", empresa_id: empresa.id },
      { nome: "Negociação", ordem: 3, cor: "#f59e0b", empresa_id: empresa.id },
      { nome: "Fechamento", ordem: 4, cor: "#06b6d4", empresa_id: empresa.id },
      { nome: "Ganho", ordem: 5, cor: "#22c55e", is_won: true, empresa_id: empresa.id },
      { nome: "Perdido", ordem: 6, cor: "#ef4444", is_lost: true, empresa_id: empresa.id },
    ];

    const { error: stagesError } = await supabaseAdmin
      .from("orbit_pipeline_stages")
      .insert(defaultStages);

    if (stagesError) {
      console.error("Error creating stages:", stagesError);
    }

    // 6. Create default AI config for the empresa
    const { error: aiConfigError } = await supabaseAdmin
      .from("orbit_ai_config")
      .insert({
        empresa_id: empresa.id,
        modo_automatico: true,
        tom_conversa: "profissional e amigável",
        horario_inicio: "08:00",
        horario_fim: "18:00",
      });

    if (aiConfigError) {
      console.error("Error creating AI config:", aiConfigError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        empresa,
        user: {
          id: authUser.user.id,
          email: authUser.user.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
