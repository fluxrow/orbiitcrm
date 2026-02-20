import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  empresa_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { to, subject, html, empresa_id }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: to, subject, html" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if empresa is on demo plan
    if (empresa_id) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      if (planCode === "demo") {
        console.log("[orbit-send-email] Demo mode: skipping real send");
        return new Response(
          JSON.stringify({ id: "simulated", simulated: true }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Buscar configuração do Resend da empresa (incluindo api_key)
    let resendApiKey: string | null = null;
    let fromEmail = "Orbit <onboarding@resend.dev>";
    
    // Primeiro tenta buscar config da empresa específica
    let resendConfig = null;
    if (empresa_id) {
      const { data } = await supabase
        .from("orbit_resend_config")
        .select("*")
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      resendConfig = data;
    }
    
    // Se não encontrou, busca config global (empresa_id IS NULL)
    if (!resendConfig) {
      const { data } = await supabase
        .from("orbit_resend_config")
        .select("*")
        .is("empresa_id", null)
        .maybeSingle();
      resendConfig = data;
    }

    if (resendConfig) {
      // Usar a API key encontrada
      if (resendConfig.api_key) {
        resendApiKey = resendConfig.api_key;
      }

      // Configurar o remetente se disponível e ativo
      if (resendConfig.ativo && resendConfig.from_email) {
        const fromName = resendConfig.from_name || "Orbit";
        fromEmail = `${fromName} <${resendConfig.from_email}>`;
      }
    }

    // Fallback para variável de ambiente se não tiver API key da empresa
    if (!resendApiKey) {
      resendApiKey = Deno.env.get("RESEND_API_KEY") || null;
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ 
          error: "API Key do Resend não configurada. Configure a API Key nas configurações de email." 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Usar fetch diretamente para a API do Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    const result = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Erro Resend:", result);
      return new Response(
        JSON.stringify({ error: result.message || "Erro ao enviar email" }),
        { status: emailResponse.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email enviado com sucesso:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Erro ao enviar email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);