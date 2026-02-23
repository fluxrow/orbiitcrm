import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";

interface MetaMessageRequest {
  conversa_id: string;
  mensagem: string;
  empresa_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { conversa_id, mensagem, empresa_id }: MetaMessageRequest = await req.json();

    if (!conversa_id || !mensagem || !empresa_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "conversa_id, mensagem e empresa_id são obrigatórios");
    }

    const { data: conversa } = await supabase
      .from("orbit_conversas")
      .select("*, prospect:orbit_prospects(*)")
      .eq("id", conversa_id)
      .single();

    if (!conversa) {
      return fail(ErrorCodes.NOT_FOUND, "Conversa não encontrada", 404);
    }

    // ── Plan enforcement ──
    const featureCode = conversa.canal === "instagram" ? "ig_send" : "fb_send";
    const { data: canUseResult } = await supabase.rpc("saas_can_use", {
      p_empresa_id: empresa_id,
      p_feature_code: featureCode,
      p_amount: 1,
    });

    const planResponse = fromPlanCheck(canUseResult);
    if (planResponse) return planResponse;

    // Buscar config Meta
    const { data: metaConfig } = await supabase
      .from("orbit_meta_config")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("ativo", true)
      .maybeSingle();

    if (!metaConfig || !metaConfig.access_token) {
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "Meta não configurado");
    }

    const recipientId = conversa.telefone_whatsapp;
    if (!recipientId) {
      return fail(ErrorCodes.VALIDATION_ERROR, "ID do destinatário não encontrado");
    }

    const pageId = conversa.canal === "instagram"
      ? metaConfig.instagram_business_id
      : metaConfig.facebook_page_id;

    if (!pageId) {
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, `${conversa.canal} não configurado`);
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${metaConfig.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: mensagem },
          messaging_type: "RESPONSE",
        }),
      }
    );

    const result = await metaRes.json();

    if (!metaRes.ok) {
      console.error("[send-orbit-meta-message] Erro Meta:", result);
      return fail(
        ErrorCodes.PROVIDER_SEND_FAILED,
        result.error?.message || "Erro ao enviar mensagem",
        metaRes.status,
        { provider: "meta" },
      );
    }

    // Salvar mensagem no banco
    await supabase.from("orbit_mensagens").insert({
      empresa_id,
      conversa_id,
      direcao: "OUT",
      mensagem,
      canal: conversa.canal,
      provider_message_id: result.message_id,
      status: "enviada",
    });

    // Increment usage
    await supabase.rpc("saas_increment_usage", {
      p_empresa_id: empresa_id,
      p_feature_code: featureCode,
      p_amount: 1,
    });

    // Atualizar conversa
    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: mensagem.substring(0, 100),
      })
      .eq("id", conversa_id);

    return ok({ message_id: result.message_id });
  } catch (error: any) {
    console.error("[send-orbit-meta-message] Error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
