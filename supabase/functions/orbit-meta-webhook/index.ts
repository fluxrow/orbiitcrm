import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  const url = new URL(req.url);
  
  // Webhook verification (GET request from Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe") {
      // Verificar token - buscar na config da empresa
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config } = await supabase
        .from("orbit_meta_config")
        .select("*")
        .eq("webhook_verify_token", token)
        .maybeSingle();

      if (config) {
        console.log("[orbit-meta-webhook] Webhook verified for empresa:", config.empresa_id);
        return new Response(challenge, { status: 200 });
      }
    }

    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Verify Meta x-hub-signature-256 (HMAC-SHA256 of raw body using META_APP_SECRET) ──
    const appSecret = Deno.env.get("META_APP_SECRET");
    const rawBody = await req.text();

    if (!appSecret) {
      console.error("[orbit-meta-webhook] META_APP_SECRET not configured — rejecting");
      return new Response("Server not configured", { status: 503, headers: corsHeaders });
    }

    const sigHeader = req.headers.get("x-hub-signature-256") || "";
    if (!sigHeader.startsWith("sha256=")) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    const provided = sigHeader.slice("sha256=".length);

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
    const expected = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    // constant-time-ish comparison
    if (provided.length !== expected.length) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const body = JSON.parse(rawBody);
    console.log("[orbit-meta-webhook] Verified signature, dispatching to background");

    // ACK <1s — processamento pesado em background via EdgeRuntime.waitUntil.
    // Idempotência: insert em orbit_mensagens com onConflict no índice único parcial
    // (empresa_id, provider_message_id) silenciosamente descarta duplicatas.
    const processor = processInboundMeta(body, supabase).catch((e) => {
      console.error("[orbit-meta-webhook] background error:", e instanceof Error ? e.message : String(e));
    });
    // @ts-ignore — EdgeRuntime global do runtime Supabase Edge
    if (typeof EdgeRuntime !== "undefined") {
      // @ts-ignore
      EdgeRuntime.waitUntil(processor);
    }

    return new Response(
      JSON.stringify({ ok: true, queued: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[orbit-meta-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
