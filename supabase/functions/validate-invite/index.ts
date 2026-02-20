import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return json({ error: "Token obrigatório" }, 400);
    }

    const tokenHash = await hashToken(token);

    // Query invite with joins
    const { data: invite, error } = await supabase
      .from("saas_invites")
      .select("id, email, responsible_name, expires_at, used_at, empresa_id, orbit_empresas(id, nome), saas_empresa:empresa_id(plan_id, saas_plans(code, name))")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      console.error("Query error:", error);
      return json({ error: "Erro ao buscar convite" }, 500);
    }

    if (!invite) {
      return json({ error: "Convite não encontrado ou token inválido" }, 404);
    }

    // Check if already used
    if (invite.used_at) {
      return json({ error: "Este convite já foi utilizado" }, 410);
    }

    // Check expiration
    if (new Date(invite.expires_at) < new Date()) {
      return json({ error: "Este convite expirou" }, 410);
    }

    // Extract joined data
    const empresa = invite.orbit_empresas as any;
    const saasEmpresa = invite.saas_empresa as any;
    const plan = saasEmpresa?.saas_plans as any;

    return json({
      valid: true,
      empresa_nome: empresa?.nome || "",
      responsible_name: invite.responsible_name || "",
      responsible_email: invite.email,
      plan_code: plan?.code || "demo",
      plan_name: plan?.name || "Demo",
      expires_at: invite.expires_at,
    });
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
