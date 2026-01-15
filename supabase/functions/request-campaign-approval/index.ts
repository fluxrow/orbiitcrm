import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalRequest {
  campaign_id: string;
  user_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { campaign_id, user_id }: ApprovalRequest = await req.json();

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id é obrigatório" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar campanha
    const { data: campaign, error: campaignError } = await supabase
      .from("orbit_campaigns")
      .select("*, template:orbit_message_templates(nome)")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campanha não encontrada" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar usuário solicitante
    const { data: solicitante } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", user_id)
      .single();

    // Atualizar status da campanha
    await supabase
      .from("orbit_campaigns")
      .update({ 
        aprovacao_status: "pendente",
        status: "pendente_aprovacao"
      })
      .eq("id", campaign_id);

    // Registrar solicitação no log de aprovações
    await supabase
      .from("orbit_campaign_approvals")
      .insert({
        campaign_id,
        empresa_id: campaign.empresa_id,
        acao: "solicitada",
        user_id,
      });

    // Buscar admins/gerentes para notificar
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id, profiles!inner(nome, telefone)")
      .in("role", ["super_admin", "admin"])
      .limit(10);

    // Buscar configuração Z-API para enviar notificação
    const { data: zapiConfig } = await supabase
      .from("orbit_zapi_config")
      .select("*")
      .eq("empresa_id", campaign.empresa_id)
      .eq("ativo", true)
      .maybeSingle();

    if (zapiConfig && admins && admins.length > 0) {
      const mensagem = `📋 *Solicitação de Aprovação de Campanha*\n\n` +
        `Campanha: *${campaign.nome}*\n` +
        `Canal: ${campaign.canal === "email" ? "📧 Email" : "📱 WhatsApp"}\n` +
        `Template: ${campaign.template?.nome || "N/A"}\n` +
        `Destinatários: ${campaign.total_destinatarios || 0}\n` +
        `Solicitado por: ${solicitante?.nome || "Desconhecido"}\n\n` +
        `Acesse o Orbit CRM para aprovar ou reprovar.`;

      for (const admin of admins) {
        const profile = admin.profiles as any;
        if (profile?.telefone) {
          const phone = profile.telefone.replace(/\D/g, "");
          try {
            await fetch(
              `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, message: mensagem }),
              }
            );
          } catch (e) {
            console.error("Erro ao notificar admin:", e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Solicitação de aprovação enviada" }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Erro ao solicitar aprovação:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
