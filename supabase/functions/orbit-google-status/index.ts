// Retorna status da conexão Google Calendar para uma empresa
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, ok, fail, ErrorCodes } from "../_shared/responses.ts";
import { resolveAuthorizedTenant, TenantContextError } from "../_shared/tenant-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "missing bearer token", 401, undefined, req);
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error } = await supaUser.auth.getClaims(token);
    if (error || !claims?.claims) return fail(ErrorCodes.UNAUTHORIZED, "invalid token", 401, undefined, req);

    const url = new URL(req.url);
    const userId = claims.claims.sub as string;
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { empresaId } = await resolveAuthorizedTenant(svc, userId, {
      tenant_slug: url.searchParams.get("tenant_slug"),
      empresa_id: url.searchParams.get("empresa_id"),
    });

    const { data, error: dbErr } = await svc
      .from("orbit_google_tokens")
      .select("google_email, calendar_id, timezone, availability_start, availability_end, booking_min_notice_minutes, booking_max_horizon_days, expires_at, created_at, updated_at")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (dbErr) return fail(ErrorCodes.INTERNAL_ERROR, dbErr.message, 500, undefined, req);

    return ok({
      connected: !!data,
      google_email: data?.google_email ?? null,
      calendar_id: data?.calendar_id ?? null,
      timezone: data?.timezone ?? null,
      availability_start: data?.availability_start?.slice(0, 5) ?? "09:00",
      availability_end: data?.availability_end?.slice(0, 5) ?? "18:00",
      booking_min_notice_minutes: data?.booking_min_notice_minutes ?? 60,
      booking_max_horizon_days: data?.booking_max_horizon_days ?? 60,
      connected_at: data?.created_at ?? null,
      provider_configured: !!Deno.env.get("GOOGLE_CLIENT_ID") && !!Deno.env.get("GOOGLE_CLIENT_SECRET"),
    }, undefined, req);
  } catch (e) {
    if (e instanceof TenantContextError) {
      return fail(e.status === 403 ? ErrorCodes.FORBIDDEN : ErrorCodes.VALIDATION_ERROR, e.message, e.status, undefined, req);
    }
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
