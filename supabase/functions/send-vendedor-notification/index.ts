import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  prospect_id: string;
  vendedor_id: string;
  empresa_id: string;
  tipo?: "atribuicao" | "transferencia";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { prospect_id, vendedor_id, empresa_id, tipo = "atribuicao" }: NotificationRequest = await req.json();

    if (!prospect_id || !vendedor_id || !empresa_id) {
      return new Response(
        JSON.stringify({ error: "prospect_id, vendedor_id e empresa_id são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar prospect
    const { data: prospect } = await supabase
      .from("orbit_prospects")
      .select("*")
      .eq("id", prospect_id)
      .single();

    if (!prospect) {
      return new Response(
        JSON.stringify({ error: "Prospect não encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar vendedor
    const { data: vendedor } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", vendedor_id)
      .single();

    if (!vendedor || !vendedor.telefone) {
      return new Response(
        JSON.stringify({ error: "Vendedor não encontrado ou sem telefone" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar configuração Z-API
    const { data: zapiConfig } = await supabase
      .from("orbit_zapi_config")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("ativo", true)
      .maybeSingle();

    if (!zapiConfig) {
      return new Response(
        JSON.stringify({ error: "Z-API não configurado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emoji = tipo === "transferencia" ? "🔄" : "🆕";
    const acao = tipo === "transferencia" ? "transferido para você" : "atribuído a você";

    const mensagem = `${emoji} *Novo Lead ${tipo === "transferencia" ? "Transferido" : "Atribuído"}*\n\n` +
      `Um prospect foi ${acao}:\n\n` +
      `👤 *Nome:* ${prospect.nome_razao}\n` +
      (prospect.nome_fantasia ? `🏢 *Fantasia:* ${prospect.nome_fantasia}\n` : "") +
      (prospect.telefone_whatsapp ? `📱 *Telefone:* ${prospect.telefone_whatsapp}\n` : "") +
      (prospect.email_principal ? `📧 *Email:* ${prospect.email_principal}\n` : "") +
      (prospect.cidade ? `📍 *Cidade:* ${prospect.cidade}${prospect.estado ? ` - ${prospect.estado}` : ""}\n` : "") +
      (prospect.segmento ? `🏷️ *Segmento:* ${prospect.segmento}\n` : "") +
      `\nAcesse o Orbit CRM para mais detalhes.`;

    const phone = vendedor.telefone.replace(/\D/g, "");
    
    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: mensagem }),
      }
    );

    if (!zapiRes.ok) {
      const err = await zapiRes.json();
      throw new Error(err.message || "Erro ao enviar notificação");
    }

    // Registrar transferência se for o caso
    if (tipo === "transferencia") {
      await supabase
        .from("orbit_transferencias")
        .update({ notificacao_enviada: true })
        .eq("prospect_id", prospect_id)
        .eq("para_vendedor_id", vendedor_id)
        .eq("notificacao_enviada", false);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notificação enviada" }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Erro ao enviar notificação:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
