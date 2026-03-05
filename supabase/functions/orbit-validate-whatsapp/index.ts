import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

interface ValidateRequest {
  prospect_ids: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { prospect_ids }: ValidateRequest = await req.json();

    if (!prospect_ids?.length) {
      return fail(ErrorCodes.VALIDATION_ERROR, "prospect_ids é obrigatório");
    }

    // Get prospects
    const { data: prospects, error } = await supabase
      .from("orbit_prospects")
      .select("id, whatsapp, whatsapp_status, empresa_id")
      .in("id", prospect_ids)
      .not("whatsapp", "is", null);

    if (error) throw error;
    if (!prospects?.length) {
      return ok({ validados: 0, validos: 0, invalidos: 0, message: "Nenhum prospect com WhatsApp" });
    }

    // Get Z-API config from first prospect's empresa
    const empresaId = prospects[0].empresa_id;
    if (!empresaId) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Prospect sem empresa_id");
    }

    const { data: zapiConfig } = await supabase
      .from("orbit_zapi_config")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .maybeSingle();

    if (!zapiConfig?.instance_id || !zapiConfig?.token) {
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "Z-API não configurado");
    }

    let validos = 0;
    let invalidos = 0;

    for (const prospect of prospects) {
      try {
        const phone = prospect.whatsapp!.replace(/\D/g, "");
        if (!phone) continue;

        const zapiBaseUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}`;

        const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token || "",
          },
        });

        if (!res.ok) {
          console.error(`[validate-whatsapp] Z-API error for ${phone}:`, res.status);
          continue;
        }

        const result = await res.json();
        const exists = result.exists === true;
        const newStatus = exists ? "valido" : "invalido";

        await supabase
          .from("orbit_prospects")
          .update({ whatsapp_status: newStatus })
          .eq("id", prospect.id);

        if (exists) validos++;
        else invalidos++;
      } catch (err) {
        console.error(`[validate-whatsapp] Error for prospect ${prospect.id}:`, err);
      }
    }

    return ok({
      validados: validos + invalidos,
      validos,
      invalidos,
      total: prospects.length,
    });
  } catch (error: any) {
    console.error("[validate-whatsapp] Error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);