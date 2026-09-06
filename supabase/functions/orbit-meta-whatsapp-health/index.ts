import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getOrbitMetaWhatsAppRuntimeConfig,
  isMetaWhatsAppReady,
} from "../_shared/meta-whatsapp.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData } = await userClient.auth.getUser();
  if (!authData.user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* handled below */ }
  const empresaId = String(body?.empresa_id ?? "");
  if (!empresaId) {
    return new Response(
      JSON.stringify({ ok: false, error: "empresa_id_required" }),
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }

  // The public RPC is the authorization gate; it returns no credentials.
  const { error: accessError } = await userClient.rpc(
    "get_orbit_meta_whatsapp_config_public",
    { p_empresa_id: empresaId },
  );
  if (accessError) {
    return new Response(JSON.stringify({ ok: false, error: "access_denied" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const config = await getOrbitMetaWhatsAppRuntimeConfig(service, empresaId);
  if (!isMetaWhatsAppReady(config)) {
    return new Response(
      JSON.stringify({ ok: false, error: "configuration_incomplete" }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }

  const version = /^v\d+[.]\d+$/.test(config.graph_api_version)
    ? config.graph_api_version
    : "v25.0";
  const fields =
    "id,display_phone_number,verified_name,quality_rating,name_status,code_verification_status";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${
      encodeURIComponent(config.phone_number_id!)
    }?fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${config.access_token}` } },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        status: response.status,
        error_code: (json as any)?.error?.code ?? null,
        error_subcode: (json as any)?.error?.error_subcode ?? null,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      phone_number_id_suffix: String((json as any)?.id ?? "").slice(-4),
      verified_name: (json as any)?.verified_name ?? null,
      quality_rating: (json as any)?.quality_rating ?? null,
      name_status: (json as any)?.name_status ?? null,
      code_verification_status: (json as any)?.code_verification_status ?? null,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
