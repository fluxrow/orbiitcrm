import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

const INTERNAL_NOTIFY_EMAIL = "fbcfarias@icloud.com";
const APP_BASE_URL = Deno.env.get("APP_URL") || "https://orbit.fluxrow.pro";

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { token, responses } = await req.json();
    if (!token) return fail(ErrorCodes.VALIDATION_ERROR, "token obrigatório");

    const { data, error } = await supabase.rpc("submit_onboarding", {
      p_token: token,
      p_responses: responses ?? {},
    });
    if (error) return fail(ErrorCodes.INTERNAL_ERROR, error.message, 500);
    const result = data as any;
    if (!result?.ok) return fail(ErrorCodes.NOT_FOUND, result?.error ?? "not_found", 404);

    // Send internal notification
    const { apiKey, fromEmail } = await getSystemEmailConfig(supabase);
    if (apiKey) {
      const { data: row } = await supabase
        .from("orbit_client_onboardings")
        .select("cliente_nome, cliente_email, cliente_empresa, empresa_id")
        .eq("id", result.data.id).maybeSingle();
      const { data: emp } = await supabase
        .from("orbit_empresas").select("slug, nome").eq("id", row?.empresa_id).maybeSingle();
      const internalLink = `${APP_BASE_URL}/${emp?.slug ?? ""}/onboarding`;
      const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 12px">✅ Onboarding concluído</h2>
          <p><strong>Cliente:</strong> ${row?.cliente_nome} (${row?.cliente_email})</p>
          <p><strong>Empresa:</strong> ${row?.cliente_empresa ?? "—"} · ${emp?.nome ?? ""}</p>
          <p style="margin-top:16px">
            <a href="${internalLink}" style="background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">
              Ver respostas e iniciar implementação
            </a>
          </p>
        </div>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: fromEmail,
          to: INTERNAL_NOTIFY_EMAIL,
          subject: `[Orbit] Onboarding concluído — ${row?.cliente_nome}`,
          html,
        }),
      }).catch(() => null);
    }

    return ok(result.data);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500);
  }
});
