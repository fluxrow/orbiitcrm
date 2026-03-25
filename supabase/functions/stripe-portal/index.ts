import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = claims.claims.sub as string;

    const { empresa_id, return_url } = await req.json();

    if (!empresa_id) {
      return new Response(
        JSON.stringify({ error: "empresa_id is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user belongs to empresa
    const { data: profile } = await adminClient
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .single();

    if (profile?.empresa_id !== empresa_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { data: saasEmpresa } = await adminClient
      .from("saas_empresa")
      .select("stripe_customer_id")
      .eq("empresa_id", empresa_id)
      .single();

    if (!saasEmpresa?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-04-30.basil",
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: saasEmpresa.stripe_customer_id,
      return_url:
        return_url || `${req.headers.get("origin")}/demo/meu-plano`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("stripe-portal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
