import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { empresa_id, new_price_id } = await req.json();
    if (!empresa_id || !new_price_id) {
      return new Response(JSON.stringify({ error: "empresa_id and new_price_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user belongs to empresa and is admin
    const { data: profile } = await adminClient
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .single();

    if (!profile || profile.empresa_id !== empresa_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current subscription
    const { data: saasEmpresa } = await adminClient
      .from("saas_empresa")
      .select("stripe_subscription_id")
      .eq("empresa_id", empresa_id)
      .single();

    if (!saasEmpresa?.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "No active subscription found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-04-30.basil",
    });

    // Get the subscription to find the current item
    const subscription = await stripe.subscriptions.retrieve(saasEmpresa.stripe_subscription_id);
    const currentItem = subscription.items.data[0];

    if (!currentItem) {
      return new Response(JSON.stringify({ error: "No subscription item found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If same price, no change needed
    if (currentItem.price.id === new_price_id) {
      return new Response(JSON.stringify({ message: "Already on this plan" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update subscription with proration
    const updated = await stripe.subscriptions.update(saasEmpresa.stripe_subscription_id, {
      items: [
        {
          id: currentItem.id,
          price: new_price_id,
        },
      ],
      proration_behavior: "create_prorations",
    });

    console.log(`Plan changed for empresa ${empresa_id}: ${currentItem.price.id} → ${new_price_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        status: updated.status,
        current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("stripe-change-plan error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
