import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const eventType = body.type; // e.g. "email.delivered", "email.bounced"
    const data = body.data;

    if (!eventType || !data) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendEmailId = data.email_id;
    if (!resendEmailId) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find recipient by resend_email_id
    const { data: recipient } = await supabase
      .from("orbit_campaign_recipients")
      .select("id, campaign_id, empresa_id")
      .eq("resend_email_id", resendEmailId)
      .maybeSingle();

    if (!recipient) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "recipient_not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Resend event to our event type
    const eventMap: Record<string, string> = {
      "email.delivered": "delivered",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.opened": "opened",
      "email.clicked": "clicked",
    };

    const mappedEvent = eventMap[eventType];
    if (!mappedEvent) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "unknown_event" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert event
    await supabase.from("orbit_email_events").insert({
      recipient_id: recipient.id,
      empresa_id: recipient.empresa_id,
      resend_email_id: resendEmailId,
      event_type: mappedEvent,
      url: data.click?.url || null,
      raw_payload: body,
    });

    // Update recipient timestamps
    const now = new Date().toISOString();
    const updateData: Record<string, any> = {};

    switch (mappedEvent) {
      case "delivered":
        updateData.delivered_at = now;
        updateData.engagement_status = "delivered";
        break;
      case "bounced":
        updateData.bounced_at = now;
        updateData.engagement_status = "bounced";
        break;
      case "complained":
        updateData.complained_at = now;
        updateData.engagement_status = "complained";
        break;
      case "opened":
        updateData.opened_at = now;
        updateData.engagement_status = "engaged";
        break;
      case "clicked":
        updateData.clicked_at = now;
        updateData.opened_at = now; // implicit open
        updateData.engagement_status = "engaged";
        break;
    }

    // Only update if field is null (first occurrence) for opened/clicked
    if (mappedEvent === "opened" || mappedEvent === "clicked") {
      await supabase
        .from("orbit_campaign_recipients")
        .update(updateData)
        .eq("id", recipient.id)
        .is(`${mappedEvent === "opened" ? "opened_at" : "clicked_at"}`, null);
    } else {
      await supabase
        .from("orbit_campaign_recipients")
        .update(updateData)
        .eq("id", recipient.id);
    }

    // Update campaign counters
    if (recipient.campaign_id && (mappedEvent === "delivered" || mappedEvent === "bounced")) {
      // For delivered/bounced, no specific counter in campaigns table yet
      // but we can track bounced as falhas
      if (mappedEvent === "bounced") {
        const { data: camp } = await supabase
          .from("orbit_campaigns")
          .select("falhas")
          .eq("id", recipient.campaign_id)
          .single();
        if (camp) {
          await supabase
            .from("orbit_campaigns")
            .update({ falhas: (camp.falhas || 0) + 1 })
            .eq("id", recipient.campaign_id);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, event: mappedEvent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
