// Inicia OAuth Google: cria state, persiste e devolve URL de consentimento
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, ok, fail, ErrorCodes } from "../_shared/responses.ts";
import { buildAuthUrl } from "../_shared/google-calendar.ts";

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
    const empresaId = (body.empresa_id ?? "").toString();
    const redirectAfter = (body.redirect_after ?? "").toString() || null;
    if (!empresaId) return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id obrigatório", 400, undefined, req);

    if (!Deno.env.get("GOOGLE_CLIENT_ID") || !Deno.env.get("GOOGLE_CLIENT_SECRET")) {
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "Google OAuth não configurado no servidor", 500, undefined, req);
    }

    // Verifica que o usuário pertence à empresa (super_admin OR profile OR membership)
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const [{ data: profile }, { data: roleRow }, { data: peSuper }, { data: membership }] = await Promise.all([
      svc.from("profiles").select("empresa_id").eq("id", userId).maybeSingle(),
      svc.from("user_roles").select("role").eq("user_id", userId),
      svc.rpc("pe_is_super_admin", { p_user_id: userId }),
      svc.from("user_empresa_memberships").select("empresa_id").eq("user_id", userId).eq("empresa_id", empresaId).maybeSingle(),
    ]);
    const isSuperAdmin = !!peSuper || (roleRow ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuperAdmin && profile?.empresa_id !== empresaId && !membership) {
      return fail(ErrorCodes.FORBIDDEN, "usuário não pertence à empresa", 403, undefined, req);
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
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
