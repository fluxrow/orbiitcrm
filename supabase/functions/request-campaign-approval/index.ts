import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

interface ApprovalRequest {
  campaign_id: string;
  user_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.AUTH_ERROR, "Não autenticado", 401);
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getUser();
    if (claimsError || !claimsData?.user) {
      return fail(ErrorCodes.AUTH_ERROR, "Token inválido", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { campaign_id, user_id }: ApprovalRequest = await req.json();

    if (!campaign_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "campaign_id é obrigatório");
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("orbit_campaigns")
      .select("*, template:orbit_message_templates(nome)")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return fail(ErrorCodes.NOT_FOUND, "Campanha não encontrada", 404);
    }

    const { data: solicitante } = await supabase.from("profiles").select("nome").eq("id", user_id).single();

    await supabase.from("orbit_campaigns").update({ aprovacao_status: "pendente", status: "pendente_aprovacao" }).eq("id", campaign_id);

    await supabase.from("orbit_campaign_approvals").insert({
      campaign_id,
      empresa_id: campaign.empresa_id,
      acao: "solicitada",
      user_id,
    });

    // Buscar admins para notificar
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id, profiles!inner(nome, telefone)")
      .in("role", ["super_admin", "admin"])
      .limit(10);

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
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, message: mensagem }) },
            );
          } catch (e) {
            console.error("Erro ao notificar admin:", e);
          }
        }
      }
    }

    return ok({ message: "Solicitação de aprovação enviada" });
  } catch (error: any) {
    console.error("Erro ao solicitar aprovação:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
