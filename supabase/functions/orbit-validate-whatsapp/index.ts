import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getOrbitZapiRuntimeConfig } from "../_shared/orbit-zapi.ts";

interface ValidateRequest {
  prospect_ids: string[];
}

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
    console.log(`[validate-whatsapp] phone=${phone} http=${res.status} body=${bodyText.slice(0, 300)}`);

    if (!res.ok) return "inconclusive";
    if (!result || typeof result !== "object") return "inconclusive";
    if (result.error || result.connected === false) return "inconclusive";
    if (result.exists === true) return "valid";
    if (result.exists === false) return "invalid";
    return "inconclusive";
  } catch (err) {
    console.error(`[validate-whatsapp] Exception ${phone}:`, err);
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
    console.log(`[validate-whatsapp] zapi-status http=${res.status} body=${bodyText.slice(0, 300)}`);
    return !!(raw && (raw.connected === true || raw.smartphoneConnected === true));
  } catch (err) {
    console.error(`[validate-whatsapp] zapi-status exception:`, err);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail(ErrorCodes.UNAUTHORIZED, "Token obrigatório", 401);
  const { data: { user: callerUser }, error: authError } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  ).auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !callerUser) return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { prospect_ids }: ValidateRequest = await req.json();

    if (!prospect_ids?.length) {
      return fail(ErrorCodes.VALIDATION_ERROR, "prospect_ids é obrigatório");
    }

    const { data: prospects, error } = await supabase
      .from("orbit_prospects")
      .select("id, whatsapp, whatsapp_status, telefone, empresa_id")
      .in("id", prospect_ids);

    if (error) throw error;
    if (!prospects?.length) {
      return ok({ validados: 0, validos: 0, invalidos: 0, message: "Nenhum prospect encontrado" });
    }

    const empresaId = prospects[0].empresa_id;
    if (!empresaId) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Prospect sem empresa_id");
    }

    const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresaId);

    if (!zapiConfig?.instance_id || !zapiConfig?.token) {
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "Z-API não configurado");
    }

    const zapiBaseUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Client-Token": zapiConfig.client_token || "",
    };

    // Pré-check da instância
    const connected = await checkInstanceConnected(zapiBaseUrl, headers);
    if (!connected) {
      return fail(
        ErrorCodes.PROVIDER_NOT_CONFIGURED,
        "Instância Z-API desconectada. Reconecte e tente novamente. Nenhum prospect foi marcado como inválido.",
        400
      );
    }

    let validos = 0;
    let invalidos = 0;
    let inconclusivos = 0;
    let migrados_telefone = 0;

    for (const prospect of prospects) {
      try {
        // Case 1: já tem whatsapp → validar diretamente
        if (prospect.whatsapp) {
          const phone = prospect.whatsapp.replace(/\D/g, "");
          if (!phone) continue;

          await delay(500);
          const result = await checkPhone(phone, zapiBaseUrl, headers);

          if (result === "inconclusive") {
            console.warn(`[validate-whatsapp] inconclusive for prospect ${prospect.id} — skipping cache`);
            inconclusivos++;
            continue;
          }

          await supabase
            .from("orbit_prospects")
            .update({
              whatsapp_status: result === "valid" ? "valido" : "invalido",
              whatsapp_last_check_at: new Date().toISOString(),
            })
            .eq("id", prospect.id);

          if (result === "valid") validos++;
          else invalidos++;
          continue;
        }

        // Case 2: sem whatsapp mas com telefone 10 dígitos → tentar descobrir
        if (!prospect.whatsapp && prospect.telefone) {
          let digits = prospect.telefone.replace(/\D/g, "");
          let stripped = digits;
          if (stripped.startsWith("55") && stripped.length >= 12) {
            stripped = stripped.slice(2);
          }
          if (stripped.length !== 10) continue;

          const phone10 = "55" + stripped;
          let foundResult: ValidationResult = "invalid";
          let foundPhone = phone10;

          await delay(500);
          let r1 = await checkPhone(phone10, zapiBaseUrl, headers);
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

          if (foundResult === "inconclusive") {
            console.warn(`[validate-whatsapp] inconclusive (telefone) prospect ${prospect.id} — skipping cache`);
            inconclusivos++;
            continue;
          }

          if (foundResult === "valid") {
            await supabase
              .from("orbit_prospects")
              .update({
                whatsapp: foundPhone,
                whatsapp_status: "valido",
                whatsapp_last_check_at: new Date().toISOString(),
              })
              .eq("id", prospect.id);
            validos++;
            migrados_telefone++;
          } else {
            await supabase
              .from("orbit_prospects")
              .update({ whatsapp_status: "invalido", whatsapp_last_check_at: new Date().toISOString() })
              .eq("id", prospect.id);
            invalidos++;
          }
        }
      } catch (err) {
        console.error(`[validate-whatsapp] Error for prospect ${prospect.id}:`, err);
      }
    }

    return ok({
      validados: validos + invalidos,
      validos,
      invalidos,
      inconclusivos,
      migrados_telefone,
      total: prospects.length,
    });
  } catch (error: any) {
    console.error("[validate-whatsapp] Error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
