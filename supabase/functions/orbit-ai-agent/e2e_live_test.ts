// LIVE E2E — Google Calendar controlado (não invoca WhatsApp, não persiste em orbit_meetings).
// Executa apenas se LIVE_GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET estiverem
// definidos no ambiente. Cleanup mandatório via finally.
//
// Rodar: deno test --allow-net --allow-env supabase/functions/orbit-ai-agent/e2e_live_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const REFRESH = Deno.env.get("LIVE_GOOGLE_REFRESH_TOKEN");
const CID = Deno.env.get("GOOGLE_CLIENT_ID");
const CSEC = Deno.env.get("GOOGLE_CLIENT_SECRET");
const CAL = Deno.env.get("LIVE_GOOGLE_CALENDAR_ID") ?? "primary";
const PREFIX = "E2E GO LIVE 20260720";

const skip = !REFRESH || !CID || !CSEC;

async function refreshAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: CID!,
    client_secret: CSEC!,
    refresh_token: REFRESH!,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`refresh failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.access_token as string;
}

Deno.test({
  name: "LIVE Google: freeBusy + insert + delete (cleanup mandatório)",
  ignore: skip,
  fn: async () => {
    const at = await refreshAccessToken();
    // slot longe (24h no futuro), duração 15min
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    start.setUTCSeconds(0, 0);
    const end = new Date(start.getTime() + 15 * 60 * 1000);

    // freeBusy
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: CAL }],
      }),
    });
    assertEquals(fbRes.ok, true, `freeBusy status ${fbRes.status}`);
    await fbRes.json();

    let createdId: string | null = null;
    try {
      const ins = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL)}/events`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: `${PREFIX} — smoke`,
            description: "E2E controlado, ignorar. Será deletado no cleanup.",
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          }),
        },
      );
      assertEquals(ins.ok, true, `insert status ${ins.status}`);
      const evt = await ins.json();
      createdId = evt.id;
      assert(createdId, "event id retornado");
    } finally {
      if (createdId) {
        const del = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL)}/events/${createdId}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${at}` } },
        );
        // 204 = deletado, 410 = já removido (idempotente).
        assert([204, 410].includes(del.status), `delete status ${del.status}`);
      }
    }
  },
});
