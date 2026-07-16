// Revoga e remove tokens Google de uma empresa
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
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error } = await supaUser.auth.getClaims(token);
    if (error || !claims?.claims) return fail(ErrorCodes.UNAUTHORIZED, "invalid token", 401, undefined, req);

    const userId = claims.claims.sub as string;
    const body = await req.json().catch(() => ({}));
    const empresaId = (body.empresa_id ?? "").toString();
    if (!empresaId) return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id obrigatório", 400, undefined, req);

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    const { data: row } = await svc.from("orbit_google_tokens").select("refresh_token").eq("empresa_id", empresaId).maybeSingle();
    if (row?.refresh_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, { method: "POST" });
      } catch (e) { console.warn("revoke failed (continuing)", e); }
    }
    const { error: delErr } = await svc.from("orbit_google_tokens").delete().eq("empresa_id", empresaId);
    if (delErr) return fail(ErrorCodes.INTERNAL_ERROR, delErr.message, 500, undefined, req);

    return ok({ disconnected: true }, undefined, req);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
