// Retorna status da conexão Google Calendar para uma empresa
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, ok, fail, ErrorCodes } from "../_shared/responses.ts";

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
    const empresaId = url.searchParams.get("empresa_id");
    if (!empresaId) return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id obrigatório", 400, undefined, req);

    const userId = claims.claims.sub as string;
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Tenant access: super_admin OR profiles.empresa_id OR active membership.
    const [{ data: roles }, { data: peSuper }, { data: profile }, { data: membership }] = await Promise.all([
      svc.from("user_roles").select("role").eq("user_id", userId),
      svc.rpc("pe_is_super_admin", { p_user_id: userId }),
      svc.from("profiles").select("empresa_id").eq("id", userId).maybeSingle(),
      svc.from("user_empresa_memberships").select("empresa_id").eq("user_id", userId).eq("empresa_id", empresaId).maybeSingle(),
    ]);
    const isSuper = !!peSuper || (roles ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper && profile?.empresa_id !== empresaId && !membership) {
      return fail(ErrorCodes.FORBIDDEN, "usuário não pertence à empresa", 403, undefined, req);
    }

    const { data, error: dbErr } = await svc
      .from("orbit_google_tokens")
      .select("google_email, calendar_id, timezone, availability_start, availability_end, expires_at, created_at, updated_at")
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
      connected_at: data?.created_at ?? null,
      provider_configured: !!Deno.env.get("GOOGLE_CLIENT_ID") && !!Deno.env.get("GOOGLE_CLIENT_SECRET"),
    }, undefined, req);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
