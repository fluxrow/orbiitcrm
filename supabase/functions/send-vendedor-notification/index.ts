import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";

interface NotificationRequest {
  prospect_id: string;
  vendedor_id: string;
  empresa_id: string;
  tipo?: "atribuicao" | "transferencia";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // SECURITY: require Authorization. Accept either a valid user JWT (and
    // verify tenant membership) OR an internal service-role bearer (used by
    // orbit-flow-executor for server-to-server notifications).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autenticado", 401);
    }
    const bearer = authHeader.replace("Bearer ", "");
    const isInternalCall = bearer === supabaseKey;

    let callerUserId: string | null = null;
    if (!isInternalCall) {
      const { data: { user }, error: authError } = await createClient(
        supabaseUrl,
        supabaseAnonKey,
      ).auth.getUser(bearer);
      if (authError || !user) return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);
      callerUserId = user.id;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { prospect_id, vendedor_id, empresa_id, tipo = "atribuicao" }: NotificationRequest = await req.json();

    if (!prospect_id || !vendedor_id || !empresa_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "prospect_id, vendedor_id e empresa_id são obrigatórios");
    }

    // SECURITY: when called by a user, enforce tenant membership.
    if (!isInternalCall && callerUserId) {
      const { data: profile } = await supabase
        .from("profiles").select("empresa_id").eq("id", callerUserId).maybeSingle();
      const { data: membership } = await supabase
        .from("user_empresa_memberships").select("empresa_id")
        .eq("user_id", callerUserId).eq("empresa_id", empresa_id).maybeSingle();
      const { data: isSuperAdmin } = await supabase.rpc("pe_is_super_admin", { p_user_id: callerUserId });
      const belongs = profile?.empresa_id === empresa_id || !!membership || !!isSuperAdmin;
      if (!belongs) return fail(ErrorCodes.UNAUTHORIZED, "Acesso negado ao tenant", 403);
    }

    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", prospect_id).single();
    if (!prospect) return fail(ErrorCodes.NOT_FOUND, "Prospect não encontrado", 404);

    const { data: vendedor } = await supabase.from("profiles").select("*").eq("id", vendedor_id).single();
    if (!vendedor || !vendedor.telefone) return fail(ErrorCodes.NOT_FOUND, "Vendedor não encontrado ou sem telefone", 404);

    const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);
    if (!zapiConfig) return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "Z-API não configurado");

    const emoji = tipo === "transferencia" ? "🔄" : "🆕";
    const acao = tipo === "transferencia" ? "transferido para você" : "atribuído a você";

    const mensagem = `${emoji} *Novo Lead ${tipo === "transferencia" ? "Transferido" : "Atribuído"}*\n\n` +
      `Um prospect foi ${acao}:\n\n` +
      `👤 *Nome:* ${prospect.nome_razao}\n` +
      (prospect.nome_fantasia ? `🏢 *Fantasia:* ${prospect.nome_fantasia}\n` : "") +
      (prospect.telefone ? `📱 *Telefone:* ${prospect.telefone}\n` : "") +
      (prospect.whatsapp ? `💬 *WhatsApp:* ${prospect.whatsapp}\n` : "") +
      (prospect.email_principal ? `📧 *Email:* ${prospect.email_principal}\n` : "") +
      (prospect.cidade ? `📍 *Cidade:* ${prospect.cidade}${prospect.estado ? ` - ${prospect.estado}` : ""}\n` : "") +
      (prospect.segmento ? `🏷️ *Segmento:* ${prospect.segmento}\n` : "") +
      `\nAcesse o Orbit CRM para mais detalhes.`;

    const vendedorBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig);
    if (vendedorBlockReason) {
      console.warn("[send-vendedor-notification] Envio real bloqueado:", { empresa_id, reason: vendedorBlockReason });
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, vendedorBlockReason, 403, { code: "ZAPI_REAL_SEND_BLOCKED" });
    }

    const phone = vendedor.telefone.replace(/\D/g, "");
    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, message: mensagem }) },
    );

    if (!zapiRes.ok) {
      const err = await zapiRes.json();
      return fail(ErrorCodes.PROVIDER_SEND_FAILED, err.message || "Erro ao enviar notificação", 502, { provider: "zapi" });
    }

    if (tipo === "transferencia") {
      await supabase.from("orbit_transferencias").update({ notificacao_enviada: true }).eq("prospect_id", prospect_id).eq("para_vendedor_id", vendedor_id).eq("notificacao_enviada", false);
    }

    return ok({ message: "Notificação enviada" });
  } catch (error: any) {
    console.error("Erro ao enviar notificação:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
