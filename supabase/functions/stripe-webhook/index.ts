import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2025-04-30.basil",
});

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getEmpresaIdFromSubscription(subscription: any): Promise<string | null> {
  // Try metadata first
  if (subscription.metadata?.empresa_id) {
    return subscription.metadata.empresa_id;
  }
  // Fallback: look up by customer_id
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (customerId) {
    const { data } = await adminClient
      .from("saas_empresa")
      .select("empresa_id")
      .eq("stripe_customer_id", customerId)
      .single();
    return data?.empresa_id || null;
  }
  return null;
}

async function getEmpresaIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await adminClient
    .from("saas_empresa")
    .select("empresa_id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.empresa_id || null;
}

async function findPlanByPriceId(priceId: string) {
  // Check monthly price
  const { data: monthlyPlan } = await adminClient
    .from("saas_plans")
    .select("id")
    .eq("stripe_price_id_monthly", priceId)
    .single();
  if (monthlyPlan) return monthlyPlan.id;

  // Check yearly price
  const { data: yearlyPlan } = await adminClient
    .from("saas_plans")
    .select("id")
    .eq("stripe_price_id_yearly", priceId)
    .single();
  if (yearlyPlan) return yearlyPlan.id;

  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = req.headers.get("stripe-signature");

  if (!webhookSecret || !signature) {
    return new Response("Missing webhook secret or signature", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`Received Stripe event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const empresaId = session.metadata?.empresa_id;
        if (!empresaId) {
          console.error("No empresa_id in checkout session metadata");
          break;
        }

        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as any)?.id;
        const customerId = typeof session.customer === "string"
          ? session.customer
          : (session.customer as any)?.id;

        // Get subscription details for period info
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        // Try to find plan_id from price
        const priceId = sub.items?.data?.[0]?.price?.id;
        const planId = priceId ? await findPlanByPriceId(priceId) : null;

        const updateData: Record<string, any> = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_status: sub.status,
          status: "active",
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          billing_status: "paid",
        };

        if (planId) {
          updateData.plan_id = planId;
        }

        await adminClient
          .from("saas_empresa")
          .update(updateData)
          .eq("empresa_id", empresaId);

        console.log(`checkout.session.completed: updated empresa ${empresaId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const empresaId = await getEmpresaIdFromSubscription(subscription);
        if (!empresaId) {
          console.error("Could not find empresa for subscription", subscription.id);
          break;
        }

        const priceId = subscription.items?.data?.[0]?.price?.id;
        const planId = priceId ? await findPlanByPriceId(priceId) : null;

        const updateData: Record<string, any> = {
          stripe_status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_end: subscription.trial_end
            ? new Date(subscription.trial_end * 1000).toISOString()
            : null,
        };

        // Sync status
        if (subscription.status === "active") {
          updateData.status = "active";
        } else if (subscription.status === "trialing") {
          updateData.status = "trial";
        } else if (subscription.status === "past_due") {
          updateData.status = "active"; // still active but past due
        } else if (subscription.status === "incomplete" || subscription.status === "incomplete_expired") {
          updateData.status = "pending";
        } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
          updateData.status = "suspended";
        } else if (subscription.status === "paused") {
          updateData.status = "suspended";
        }

        if (planId) {
          updateData.plan_id = planId;
        }

        await adminClient
          .from("saas_empresa")
          .update(updateData)
          .eq("empresa_id", empresaId);

        console.log(`subscription.updated: updated empresa ${empresaId}, status=${subscription.status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const empresaId = await getEmpresaIdFromSubscription(subscription);
        if (!empresaId) break;

        await adminClient
          .from("saas_empresa")
          .update({
            stripe_status: "canceled",
            status: "canceled",
            cancel_at_period_end: false,
          })
          .eq("empresa_id", empresaId);

        console.log(`subscription.deleted: canceled empresa ${empresaId}`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer as any)?.id;
        if (!customerId) break;

        const empresaId = await getEmpresaIdFromCustomer(customerId);
        if (!empresaId) break;

        await adminClient
          .from("saas_empresa")
          .update({
            last_invoice_status: "paid",
            billing_status: "paid",
            last_payment_error: null,
          })
          .eq("empresa_id", empresaId);

        console.log(`invoice.paid: updated empresa ${empresaId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer as any)?.id;
        if (!customerId) break;

        const empresaId = await getEmpresaIdFromCustomer(customerId);
        if (!empresaId) break;

        const errorMessage =
          (invoice as any).last_payment_error?.message ||
          "Falha no pagamento";

        await adminClient
          .from("saas_empresa")
          .update({
            last_invoice_status: "failed",
            last_payment_error: errorMessage,
          })
          .eq("empresa_id", empresaId);

        console.log(`invoice.payment_failed: updated empresa ${empresaId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`Error handling ${event.type}:`, err);
    // Return 200 to avoid Stripe retries for processing errors
    return new Response(JSON.stringify({ received: true, error: err.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
