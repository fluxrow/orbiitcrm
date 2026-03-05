import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

interface ValidateRequest {
  prospect_ids: string[];
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    // Get prospects (include telefone for 10-digit fallback)
    const { data: prospects, error } = await supabase
      .from("orbit_prospects")
      .select("id, whatsapp, whatsapp_status, telefone, empresa_id")
      .in("id", prospect_ids);

    if (error) throw error;
    if (!prospects?.length) {
      return ok({ validados: 0, validos: 0, invalidos: 0, message: "Nenhum prospect encontrado" });
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

    const zapiBaseUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Client-Token": zapiConfig.client_token || "",
    };

    let validos = 0;
    let invalidos = 0;
    let migrados_telefone = 0;

    for (const prospect of prospects) {
      try {
        // Case 1: prospect has whatsapp → validate directly
        if (prospect.whatsapp) {
          const phone = prospect.whatsapp.replace(/\D/g, "");
          if (!phone) continue;

          await delay(500);
          const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone}`, {
            method: "GET",
            headers,
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
            .update({ whatsapp_status: newStatus, whatsapp_last_check_at: new Date().toISOString() })
            .eq("id", prospect.id);

          if (exists) validos++;
          else invalidos++;
          continue;
        }

        // Case 2: no whatsapp but has telefone with 10 digits → try to discover
        if (!prospect.whatsapp && prospect.telefone) {
          let digits = prospect.telefone.replace(/\D/g, "");
          // Strip 55 prefix
          let stripped = digits;
          if (stripped.startsWith("55") && stripped.length >= 12) {
            stripped = stripped.slice(2);
          }

          if (stripped.length !== 10) continue;

          // Try 55 + 10 digits
          const phone10 = "55" + stripped;
          let found = false;

          await delay(500);
          try {
            const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone10}`, {
              method: "GET",
              headers,
            });
            if (res.ok) {
              const result = await res.json();
              if (result.exists === true) {
                  await supabase
                    .from("orbit_prospects")
                    .update({ whatsapp: phone10, whatsapp_status: "valido", whatsapp_last_check_at: new Date().toISOString() })
                    .eq("id", prospect.id);
                validos++;
                migrados_telefone++;
                found = true;
              }
            }
          } catch (err) {
            console.error(`[validate-whatsapp] Z-API error for ${phone10}:`, err);
          }

          // Try adding 9 after DDD
          if (!found) {
            const ddd = stripped.slice(0, 2);
            const rest = stripped.slice(2);
            const phone11 = "55" + ddd + "9" + rest;

            await delay(500);
            try {
              const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone11}`, {
                method: "GET",
                headers,
              });
              if (res.ok) {
                const result = await res.json();
                if (result.exists === true) {
                  await supabase
                    .from("orbit_prospects")
                    .update({ whatsapp: phone11, whatsapp_status: "valido", whatsapp_last_check_at: new Date().toISOString() })
                    .eq("id", prospect.id);
                  validos++;
                  migrados_telefone++;
                  found = true;
                }
              }
            } catch (err) {
              console.error(`[validate-whatsapp] Z-API error for ${phone11}:`, err);
            }
          }

          if (!found) {
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
      migrados_telefone,
      total: prospects.length,
    });
  } catch (error: any) {
    console.error("[validate-whatsapp] Error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
