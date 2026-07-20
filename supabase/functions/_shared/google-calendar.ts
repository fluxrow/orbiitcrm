// Helper compartilhado para Google Calendar (OAuth + Calendar API)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export function getCallbackUrl(): string {
  const url = Deno.env.get("SUPABASE_URL")!;
  return `${url}/functions/v1/orbit-google-callback`;
}

export function buildAuthUrl(state: string): string {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID missing");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    redirect_uri: getCallbackUrl(),
    grant_type: "authorization_code",
  });
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`google token exchange failed: ${r.status} ${await r.text()}`);
  return await r.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    grant_type: "refresh_token",
  });
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`google refresh failed: ${r.status} ${await r.text()}`);
  return await r.json() as { access_token: string; expires_in: number; scope: string };
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.email ?? null;
  } catch {
    return null;
  }
}

export interface GoogleTokenRow {
  id: string;
  empresa_id: string;
  user_id: string;
  google_email: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_id: string;
  timezone: string;
  availability_start: string;
  availability_end: string;
}

export function svcClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Garante access token vivo. Refresha quando expira em <60s. */
export async function ensureFreshAccessToken(row: GoogleTokenRow): Promise<string> {
  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return row.access_token;

  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpiry = new Date(Date.now() + (refreshed.expires_in - 30) * 1000).toISOString();
  const supa = svcClient();
  await supa.from("orbit_google_tokens").update({
    access_token: refreshed.access_token,
    expires_at: newExpiry,
  }).eq("id", row.id);
  return refreshed.access_token;
}

export async function getTokenForEmpresa(empresaId: string): Promise<GoogleTokenRow | null> {
  const supa = svcClient();
  const { data, error } = await supa
    .from("orbit_google_tokens")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error) throw error;
  return data as GoogleTokenRow | null;
}

// ───────── Calendar API ─────────

export interface FreeBusyRange { start: string; end: string }

export async function checkAvailability(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  timezone: string,
): Promise<{ busy: FreeBusyRange[] }> {
  const r = await fetch(`${CAL_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin, timeMax, timeZone: timezone,
      items: [{ id: calendarId }],
    }),
  });
  if (!r.ok) throw new Error(`freeBusy failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const busy = j.calendars?.[calendarId]?.busy ?? [];
  return { busy };
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  start: string; // ISO
  end: string;   // ISO
  timezone: string;
  attendees?: string[];
  location?: string;
  addMeet?: boolean;
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: CreateEventInput & { source?: string },
) {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: input.end, timeZone: input.timezone },
    attendees: input.attendees?.map((email) => ({ email })),
    extendedProperties: {
      private: {
        source: input.source ?? "orbit",
      },
    },
  };
  if (input.addMeet) {
    body.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }
  const url = `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`createEvent failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

export async function listUpcomingEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  maxResults = 20,
  timeMax?: string,
) {
  const url = new URL(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", timeMin);
  if (timeMax) url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`listEvents failed: ${r.status} ${await r.text()}`);
  return await r.json();
}
