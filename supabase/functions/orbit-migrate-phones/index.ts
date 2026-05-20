import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getOrbitZapiRuntimeConfig } from "../_shared/orbit-zapi.ts";

type ValidationResult = "valid" | "invalid" | "inconclusive";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function checkPhone(
  phone: string,
  zapiBaseUrl: string,
  headers: Record<string, string>
): Promise<ValidationResult> {
  try {
    const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone}`, { method: "GET", headers });
    const bodyText = await res.text();
    let result: any = null;
    try { result = JSON.parse(bodyText); } catch { /* ignore */ }
    console.log(`[migrate-phones] phone=${phone} http=${res.status} body=${bodyText.slice(0, 300)}`);

    if (!res.ok) return "inconclusive";
    if (!result || typeof result !== "object") return "inconclusive";
    if (result.error || result.connected === false) return "inconclusive";
    if (result.exists === true) return "valid";
    if (result.exists === false) return "invalid";
    return "inconclusive";
  } catch (err) {
    console.error(`[migrate-phones] Exception ${phone}:`, err);
    return "inconclusive";
  }
}

async function checkInstanceConnected(
  zapiBaseUrl: string,
  headers: Record<string, string>
): Promise<boolean> {
  try {
    const res = await fetch(`${zapiBaseUrl}/status`, { method: "GET", headers });
    const bodyText = await res.text();
    let raw: any = null;
    try { raw = JSON.parse(bodyText); } catch { /* ignore */ }
    console.log(`[migrate-phones] zapi-status http=${res.status} body=${bodyText.slice(0, 300)}`);
    return !!(raw && (raw.connected === true || raw.smartphoneConnected === true));
  } catch (err) {
    console.error(`[migrate-phones] zapi-status exception:`, err);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { empresa_id } = await req.json();
    if (!empresa_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id é obrigatório");
    }

    const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);

    const hasZapi = !!(zapiConfig?.instance_id && zapiConfig?.token);

    const zapiBaseUrl = hasZapi
      ? `https://api.z-api.io/instances/${zapiConfig!.instance_id}/token/${zapiConfig!.token}`
      : "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Client-Token": zapiConfig?.client_token || "",
    };

    // Pré-check da instância (se houver Z-API)
    if (hasZapi) {
      const connected = await checkInstanceConnected(zapiBaseUrl, headers);
      if (!connected) {
        return fail(
          ErrorCodes.PROVIDER_NOT_CONFIGURED,
          "Instância Z-API desconectada. Reconecte e tente novamente. Nenhum prospect foi marcado como inválido.",
          400
        );
      }
    }

    let from = 0;
    const pageSize = 500;
    let total = 0;
    let migrados_11 = 0;
    let validados_zapi = 0;
    let invalidos = 0;
    let inconclusivos = 0;
    let ignorados = 0;

    let hasMore = true;
    while (hasMore) {
      const { data: prospects, error } = await supabase
        .from("orbit_prospects")
        .select("id, telefone, whatsapp")
        .eq("empresa_id", empresa_id)
        .not("telefone", "is", null)
        .is("whatsapp", null)
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!prospects || prospects.length === 0) {
        hasMore = false;
        break;
      }

      for (const prospect of prospects) {
        total++;
        let digits = (prospect.telefone || "").replace(/\D/g, "");
        let stripped = digits;
        if (stripped.startsWith("55") && stripped.length >= 12) {
          stripped = stripped.slice(2);
        }

        if (stripped.length === 11) {
          // 11 dígitos → mover direto para whatsapp
          const whatsappNum = "55" + stripped;
          await supabase
            .from("orbit_prospects")
            .update({ whatsapp: whatsappNum, whatsapp_status: "nao_verificado" })
            .eq("id", prospect.id);
          migrados_11++;
        } else if (stripped.length === 10 && hasZapi) {
          const phone10 = "55" + stripped;
          let foundResult: ValidationResult = "invalid";
          let foundPhone = phone10;

          await delay(500);
          const r1 = await checkPhone(phone10, zapiBaseUrl, headers);
          if (r1 === "valid") {
            foundResult = "valid";
            foundPhone = phone10;
          } else {
            const ddd = stripped.slice(0, 2);
            const rest = stripped.slice(2);
            const phone11 = "55" + ddd + "9" + rest;
            await delay(500);
            const r2 = await checkPhone(phone11, zapiBaseUrl, headers);
            if (r2 === "valid") {
              foundResult = "valid";
              foundPhone = phone11;
            } else if (r1 === "inconclusive" || r2 === "inconclusive") {
              foundResult = "inconclusive";
            } else {
              foundResult = "invalid";
            }
          }

          if (foundResult === "valid") {
            await supabase
              .from("orbit_prospects")
              .update({ whatsapp: foundPhone, whatsapp_status: "valido" })
              .eq("id", prospect.id);
            validados_zapi++;
          } else if (foundResult === "inconclusive") {
            // NÃO marcar invalido — deixar para reprocessar depois
            console.warn(`[migrate-phones] inconclusive prospect ${prospect.id} — skipping cache`);
            inconclusivos++;
          } else {
            await supabase
              .from("orbit_prospects")
              .update({ whatsapp_status: "invalido" })
              .eq("id", prospect.id);
            invalidos++;
          }
        } else {
          ignorados++;
        }
      }

      from += pageSize;
      hasMore = prospects.length === pageSize;
    }

    return ok({
      total,
      migrados_11,
      validados_zapi,
      invalidos,
      inconclusivos,
      ignorados,
      had_zapi: hasZapi,
    });
  } catch (error: any) {
    console.error("[migrate-phones] Error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
