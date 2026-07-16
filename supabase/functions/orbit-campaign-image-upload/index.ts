// Server-side upload for campaign-images bucket.
// Frontend never controls the path. This function generates it deterministically
// so storage.objects policies + service_role writes are the only escrow of trust.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, ok, fail, ErrorCodes } from "../_shared/responses.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

    const form = await req.formData();
    const file = form.get("file");
    const empresaId = String(form.get("empresa_id") ?? "");
    const context = String(form.get("context") ?? "campaigns").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "campaigns";

    if (!empresaId) {
      return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id obrigatório", 400, undefined, req);
    }
    if (!(file instanceof File)) {
      return fail(ErrorCodes.VALIDATION_ERROR, "file obrigatório", 400, undefined, req);
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return fail(ErrorCodes.VALIDATION_ERROR, "arquivo excede 5MB ou é vazio", 400, undefined, req);
    }
    const mime = (file.type || "").toLowerCase();
    if (!mime.startsWith("image/") || !ALLOWED_MIME.has(mime)) {
      return fail(ErrorCodes.VALIDATION_ERROR, "content-type de imagem inválido", 400, undefined, req);
    }
    const rawExt = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ext = ALLOWED_EXT.has(rawExt)
      ? rawExt
      : mime === "image/jpeg" ? "jpg"
      : mime === "image/png" ? "png"
      : mime === "image/webp" ? "webp"
      : mime === "image/gif" ? "gif"
      : "";
    if (!ext) {
      return fail(ErrorCodes.VALIDATION_ERROR, "extensão de imagem inválida", 400, undefined, req);
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Tenant access: super_admin OR profiles.empresa_id OR active membership.
    const [{ data: roles }, { data: peSuper }, { data: profile }, { data: membership }] = await Promise.all([
      svc.from("user_roles").select("role").eq("user_id", userId),
      svc.rpc("pe_is_super_admin", { p_user_id: userId }),
      svc.from("profiles").select("empresa_id").eq("id", userId).maybeSingle(),
      svc.from("user_empresa_memberships").select("empresa_id").eq("user_id", userId).eq("empresa_id", empresaId).maybeSingle(),
    ]);
    const isSuper = !!peSuper || (roles ?? []).some((r: any) => r.role === "super_admin");
    const hasAccess = isSuper || profile?.empresa_id === empresaId || !!membership;
    if (!hasAccess) {
      return fail(ErrorCodes.FORBIDDEN, "usuário não pertence à empresa", 403, undefined, req);
    }

    // Server-generated path. First segment = auth.uid() to satisfy existing
    // storage.objects policies; deeper segments encode empresa/context for audit.
    const storagePath = `${userId}/${empresaId}/${context}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await svc.storage
      .from("campaign-images")
      .upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (upErr) {
      return fail(ErrorCodes.INTERNAL_ERROR, upErr.message, 500, undefined, req);
    }

    // Bucket is private (workspace policy blocks public buckets). Return a
    // long-lived signed URL so <img src=…> keeps rendering in campaigns/templates.
    const { data: signed, error: signErr } = await svc.storage
      .from("campaign-images")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 5); // 5 years
    if (signErr || !signed?.signedUrl) {
      return fail(ErrorCodes.INTERNAL_ERROR, signErr?.message ?? "falha ao assinar URL", 500, undefined, req);
    }

    return ok({ storage_path: storagePath, public_url: signed.signedUrl }, undefined, req);
  } catch (e) {
    console.error("[orbit-campaign-image-upload]", e);
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
