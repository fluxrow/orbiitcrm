// Operações de calendário: listar eventos, checar disponibilidade, criar evento, atualizar config
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, ok, fail, ErrorCodes } from "../_shared/responses.ts";
import {
  getTokenForEmpresa, ensureFreshAccessToken,
  checkAvailability, createCalendarEvent, listUpcomingEvents,
} from "../_shared/google-calendar.ts";

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
    const empresaId = (body.empresa_id ?? "").toString();
    if (!empresaId) return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id obrigatório", 400, undefined, req);

    // Autorização: super_admin ou pertencente à empresa
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await svc.from("profiles").select("empresa_id").eq("id", userId).maybeSingle();
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", userId);
    const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper && profile?.empresa_id !== empresaId) {
      return fail(ErrorCodes.FORBIDDEN, "usuário não pertence à empresa", 403, undefined, req);
    }

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
        });
        return ok({ event }, undefined, req);
      }

      case "update_config": {
        const patch: Record<string, unknown> = {};
        if (body.calendar_id) patch.calendar_id = String(body.calendar_id);
        if (body.timezone) patch.timezone = String(body.timezone);
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
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
