// Operações de calendário: listar eventos, checar disponibilidade, criar evento, atualizar config
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, ok, fail, ErrorCodes } from "../_shared/responses.ts";
import {
  getTokenForEmpresa, ensureFreshAccessToken,
  checkAvailability, createCalendarEvent, listUpcomingEvents,
} from "../_shared/google-calendar.ts";
import { resolveAuthorizedTenant, TenantContextError } from "../_shared/tenant-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "missing bearer token", 401, undefined, req);
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const tok = authHeader.replace("Bearer ", "");
    const { data: claims, error } = await supaUser.auth.getClaims(tok);
    if (error || !claims?.claims) return fail(ErrorCodes.UNAUTHORIZED, "invalid token", 401, undefined, req);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const action = (body.action ?? "").toString();
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { empresaId } = await resolveAuthorizedTenant(svc, userId, body);

    const row = await getTokenForEmpresa(empresaId);
    if (!row && action !== "update_config") {
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "Google Calendar não conectado", 400, undefined, req);
    }

    switch (action) {
      case "list_events": {
        const access = await ensureFreshAccessToken(row!);
        const timeMin = body.time_min ?? new Date().toISOString();
        const timeMax = body.time_max ?? undefined;
        const events = await listUpcomingEvents(access, row!.calendar_id, timeMin, body.max ?? 250, timeMax);
        return ok({ events }, undefined, req);
      }

      case "check_availability": {
        const access = await ensureFreshAccessToken(row!);
        if (!body.time_min || !body.time_max) {
          return fail(ErrorCodes.VALIDATION_ERROR, "time_min e time_max obrigatórios (ISO)", 400, undefined, req);
        }
        const result = await checkAvailability(access, row!.calendar_id, body.time_min, body.time_max, row!.timezone);
        return ok(result, undefined, req);
      }

      case "create_event": {
        const access = await ensureFreshAccessToken(row!);
        if (!body.summary || !body.start || !body.end) {
          return fail(ErrorCodes.VALIDATION_ERROR, "summary, start, end obrigatórios", 400, undefined, req);
        }
        const event = await createCalendarEvent(access, row!.calendar_id, {
          summary: body.summary,
          description: body.description,
          start: body.start, end: body.end,
          timezone: body.timezone || row!.timezone,
          attendees: body.attendees,
          location: body.location,
          addMeet: !!body.add_meet,
          source: body.source || "orbit",
        });
        return ok({ event }, undefined, req);
      }

      case "update_config": {
        const patch: Record<string, unknown> = {};
        if (body.calendar_id) patch.calendar_id = String(body.calendar_id);
        if (body.timezone) patch.timezone = String(body.timezone);
        const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const availabilityStart = body.availability_start == null ? null : String(body.availability_start);
        const availabilityEnd = body.availability_end == null ? null : String(body.availability_end);
        const minNotice = body.booking_min_notice_minutes == null ? null : Number(body.booking_min_notice_minutes);
        const maxHorizon = body.booking_max_horizon_days == null ? null : Number(body.booking_max_horizon_days);
        if (availabilityStart !== null && !timePattern.test(availabilityStart)) {
          return fail(ErrorCodes.VALIDATION_ERROR, "availability_start deve usar HH:mm", 400, undefined, req);
        }
        if (availabilityEnd !== null && !timePattern.test(availabilityEnd)) {
          return fail(ErrorCodes.VALIDATION_ERROR, "availability_end deve usar HH:mm", 400, undefined, req);
        }
        const effectiveStart = availabilityStart ?? row?.availability_start?.slice(0, 5) ?? "09:00";
        const effectiveEnd = availabilityEnd ?? row?.availability_end?.slice(0, 5) ?? "18:00";
        if (effectiveStart >= effectiveEnd) {
          return fail(ErrorCodes.VALIDATION_ERROR, "o início da disponibilidade deve ser anterior ao fim", 400, undefined, req);
        }
        if (minNotice !== null && (!Number.isInteger(minNotice) || minNotice < 0 || minNotice > 10080)) {
          return fail(ErrorCodes.VALIDATION_ERROR, "booking_min_notice_minutes deve estar entre 0 e 10080", 400, undefined, req);
        }
        if (maxHorizon !== null && (!Number.isInteger(maxHorizon) || maxHorizon < 1 || maxHorizon > 365)) {
          return fail(ErrorCodes.VALIDATION_ERROR, "booking_max_horizon_days deve estar entre 1 e 365", 400, undefined, req);
        }
        if (availabilityStart !== null) patch.availability_start = availabilityStart;
        if (availabilityEnd !== null) patch.availability_end = availabilityEnd;
        if (minNotice !== null) patch.booking_min_notice_minutes = minNotice;
        if (maxHorizon !== null) patch.booking_max_horizon_days = maxHorizon;
        if (!Object.keys(patch).length) {
          return fail(ErrorCodes.VALIDATION_ERROR, "nenhum campo para atualizar", 400, undefined, req);
        }
        const { error: upErr } = await svc.from("orbit_google_tokens").update(patch).eq("empresa_id", empresaId);
        if (upErr) return fail(ErrorCodes.INTERNAL_ERROR, upErr.message, 500, undefined, req);
        return ok({ updated: true, patch }, undefined, req);
      }

      default:
        return fail(ErrorCodes.VALIDATION_ERROR, `action inválida: ${action}`, 400, undefined, req);
    }
  } catch (e) {
    console.error("[orbit-google-calendar]", e);
    if (e instanceof TenantContextError) {
      return fail(e.status === 403 ? ErrorCodes.FORBIDDEN : ErrorCodes.VALIDATION_ERROR, e.message, e.status, undefined, req);
    }
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
