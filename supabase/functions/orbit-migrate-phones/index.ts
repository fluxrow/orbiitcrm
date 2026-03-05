import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    // Get Z-API config
    const { data: zapiConfig } = await supabase
      .from("orbit_zapi_config")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("ativo", true)
      .maybeSingle();

    const hasZapi = !!(zapiConfig?.instance_id && zapiConfig?.token);

    // Paginate prospects with telefone filled and whatsapp empty
    let from = 0;
    const pageSize = 500;
    let total = 0;
    let migrados_11 = 0;
    let validados_zapi = 0;
    let invalidos = 0;
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

        // Strip country code 55 for analysis
        let stripped = digits;
        if (stripped.startsWith("55") && stripped.length >= 12) {
          stripped = stripped.slice(2);
        }

        if (stripped.length === 11) {
          // 11 digits (DDD+9) → directly move to whatsapp
          const whatsappNum = "55" + stripped;
          await supabase
            .from("orbit_prospects")
            .update({ whatsapp: whatsappNum, whatsapp_status: "nao_verificado" })
            .eq("id", prospect.id);
          migrados_11++;
        } else if (stripped.length === 10 && hasZapi) {
          // 10 digits (DDD+8) → validate via Z-API
          const zapiBaseUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}`;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token || "",
          };

          // Try original 10-digit number with country code
          const phone10 = "55" + stripped;
          let found = false;

          try {
            await delay(500);
            const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone10}`, {
              method: "GET",
              headers,
            });
            if (res.ok) {
              const result = await res.json();
              if (result.exists === true) {
                await supabase
                  .from("orbit_prospects")
                  .update({ whatsapp: phone10, whatsapp_status: "valido" })
                  .eq("id", prospect.id);
                validados_zapi++;
                found = true;
              }
            }
          } catch (err) {
            console.error(`[migrate-phones] Z-API error for ${phone10}:`, err);
          }

          // If not found, try adding 9 after DDD
          if (!found) {
            const ddd = stripped.slice(0, 2);
            const rest = stripped.slice(2);
            const phone11 = "55" + ddd + "9" + rest;

            try {
              await delay(500);
              const res = await fetch(`${zapiBaseUrl}/phone-exists/${phone11}`, {
                method: "GET",
                headers,
              });
              if (res.ok) {
                const result = await res.json();
                if (result.exists === true) {
                  await supabase
                    .from("orbit_prospects")
                    .update({ whatsapp: phone11, whatsapp_status: "valido" })
                    .eq("id", prospect.id);
                  validados_zapi++;
                  found = true;
                }
              }
            } catch (err) {
              console.error(`[migrate-phones] Z-API error for ${phone11}:`, err);
            }
          }

          if (!found) {
            // Mark as invalid - keep in telefone only
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
      ignorados,
      had_zapi: hasZapi,
    });
  } catch (error: any) {
    console.error("[migrate-phones] Error:", error);
    return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
  }
};

serve(handler);
