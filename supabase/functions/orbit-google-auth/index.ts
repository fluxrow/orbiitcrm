// Inicia OAuth Google: cria state, persiste e devolve URL de consentimento
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, ok, fail, ErrorCodes } from "../_shared/responses.ts";
import { buildAuthUrl } from "../_shared/google-calendar.ts";
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
    const { data: claims, error: claimsErr } = await supaUser.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return fail(ErrorCodes.UNAUTHORIZED, "invalid token", 401, undefined, req);
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const requestedRedirect = (body.redirect_after ?? "").toString() || null;

    if (!Deno.env.get("GOOGLE_CLIENT_ID") || !Deno.env.get("GOOGLE_CLIENT_SECRET")) {
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "Google OAuth não configurado no servidor", 500, undefined, req);
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { empresaId } = await resolveAuthorizedTenant(svc, userId, body);
    let redirectAfter: string | null = null;
    if (requestedRedirect) {
      try {
        const appOrigin = new URL(Deno.env.get("APP_URL") ?? "https://orbit.fluxrow.pro").origin;
        const redirect = new URL(requestedRedirect);
        if (redirect.origin === appOrigin) redirectAfter = redirect.toString();
      } catch { /* invalid redirects are discarded */ }
    }

    const state = crypto.randomUUID() + "." + crypto.randomUUID().slice(0, 8);
    const { error: insErr } = await svc.from("orbit_google_oauth_states").insert({
      state, empresa_id: empresaId, user_id: userId, redirect_after: redirectAfter,
    });
    if (insErr) return fail(ErrorCodes.INTERNAL_ERROR, insErr.message, 500, undefined, req);

    const url = buildAuthUrl(state);
    return ok({ url, state }, undefined, req);
  } catch (e) {
    console.error("[orbit-google-auth]", e);
    if (e instanceof TenantContextError) {
      return fail(e.status === 403 ? ErrorCodes.FORBIDDEN : ErrorCodes.VALIDATION_ERROR, e.message, e.status, undefined, req);
    }
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
