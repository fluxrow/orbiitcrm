import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const PIXEL_GIF = Uint8Array.from(atob(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
), c => c.charCodeAt(0));

serve(async (req: Request) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // "open" | "click"
  const rid = url.searchParams.get("rid");   // recipient_id

  if (!rid || !type) {
    return new Response("Missing params", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const userAgent = req.headers.get("user-agent") || null;
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  // Get recipient to find empresa_id and campaign_id
  const { data: recipient } = await supabase
    .from("orbit_campaign_recipients")
    .select("id, campaign_id, empresa_id")
    .eq("id", rid)
    .maybeSingle();

  if (!recipient) {
    if (type === "open") {
      return new Response(PIXEL_GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
    }
    return new Response("Not found", { status: 404 });
  }

  if (type === "open") {
    // Log event
    await supabase.from("orbit_email_events").insert({
      recipient_id: rid,
      empresa_id: recipient.empresa_id,
      event_type: "opened",
      user_agent: userAgent,
      ip_address: ipAddress,
    });

    // Update first open timestamp
    await supabase
      .from("orbit_campaign_recipients")
      .update({
        opened_at: new Date().toISOString(),
        engagement_status: "engaged",
      })
      .eq("id", rid)
      .is("opened_at", null);

    // Increment campaign counter
    if (recipient.campaign_id) {
      const { data: camp } = await supabase
        .from("orbit_campaigns")
        .select("aberturas")
        .eq("id", recipient.campaign_id)
        .single();
      if (camp) {
        await supabase
          .from("orbit_campaigns")
          .update({ aberturas: (camp.aberturas || 0) + 1 })
          .eq("id", recipient.campaign_id);
      }
    }

    return new Response(PIXEL_GIF, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  if (type === "click") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response("Missing url", { status: 400 });
    }

    // ── Open-redirect guard: only allow absolute http(s) URLs ──
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new Response("Invalid url", { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("Invalid url scheme", { status: 400 });
    }

    // Log event
    await supabase.from("orbit_email_events").insert({
      recipient_id: rid,
      empresa_id: recipient.empresa_id,
      event_type: "clicked",
      url: targetUrl,
      user_agent: userAgent,
      ip_address: ipAddress,
    });

    // Update first click timestamp
    await supabase
      .from("orbit_campaign_recipients")
      .update({
        clicked_at: new Date().toISOString(),
        engagement_status: "engaged",
      })
      .eq("id", rid)
      .is("clicked_at", null);

    // Also mark as opened if not yet
    await supabase
      .from("orbit_campaign_recipients")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", rid)
      .is("opened_at", null);

    // Increment campaign counter
    if (recipient.campaign_id) {
      const { data: camp } = await supabase
        .from("orbit_campaigns")
        .select("cliques")
        .eq("id", recipient.campaign_id)
        .single();
      if (camp) {
        await supabase
          .from("orbit_campaigns")
          .update({ cliques: (camp.cliques || 0) + 1 })
          .eq("id", recipient.campaign_id);
      }
    }

    return new Response(null, {
      status: 302,
      headers: { Location: parsed.toString() },
    });
  }

  return new Response("Invalid type", { status: 400 });
});
