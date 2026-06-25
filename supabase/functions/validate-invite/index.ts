import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return fail(ErrorCodes.VALIDATION_ERROR, "Token obrigatório", 400, undefined, req);
    }

    const tokenHash = await hashToken(token);

    const { data: invite, error } = await supabase
      .from("saas_invites")
      .select("id, email, responsible_name, expires_at, used_at, empresa_id, orbit_empresas(id, nome), saas_empresa:empresa_id(plan_id, saas_plans(code, name))")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      console.error("Query error:", error);
      return fail(ErrorCodes.INTERNAL_ERROR, "Erro ao buscar convite", 200, undefined, req);
    }

    if (!invite) {
      return fail(ErrorCodes.INVITE_INVALID, "Convite não encontrado ou token inválido", 200, undefined, req);
    }

    if (invite.used_at) {
      return fail(ErrorCodes.INVITE_USED, "Este convite já foi utilizado", 200, undefined, req);
    }

    if (new Date(invite.expires_at) < new Date()) {
      return fail(ErrorCodes.INVITE_EXPIRED, "Este convite expirou", 200, undefined, req);
    }

    const empresa = invite.orbit_empresas as any;
    const saasEmpresa = invite.saas_empresa as any;
    const plan = saasEmpresa?.saas_plans as any;

    return ok({
      valid: true,
      empresa_nome: empresa?.nome || "",
      responsible_name: invite.responsible_name || "",
      responsible_email: invite.email,
      plan_code: plan?.code || "demo",
      plan_name: plan?.name || "Demo",
      expires_at: invite.expires_at,
    }, undefined, req);
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return fail(ErrorCodes.INTERNAL_ERROR, msg, 500, undefined, req);
  }
});
