import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getAppUrl(): string {
  const envUrl = Deno.env.get("APP_URL");
  if (envUrl) {
    const normalized = envUrl.trim().replace(/\/$/, "");
    return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  }
  return "https://orbit.fluxrow.pro";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin");
    if (!roles?.length) return fail(ErrorCodes.FORBIDDEN, "Acesso negado. Apenas super admins.", 403, undefined, req);

    const body = await req.json().catch(() => ({}));
    const inviteId = typeof body?.invite_id === "string" ? body.invite_id.trim() : "";
    if (!UUID_RE.test(inviteId)) {
      return fail(ErrorCodes.VALIDATION_ERROR, "invite_id inválido", 400, undefined, req);
    }

    // empresa_id is derived from the persisted invite, never trusted from the client.
    const { data: invite, error: invErr } = await supabase
      .from("saas_invites")
      .select("id, empresa_id, email, responsible_name, used_at, metadata")
      .eq("id", inviteId)
      .maybeSingle();
    if (invErr) return fail(ErrorCodes.INTERNAL_ERROR, "Erro ao buscar convite", 500, undefined, req);
    if (!invite) return fail(ErrorCodes.NOT_FOUND, "Convite não encontrado", 404, undefined, req);
    if (invite.used_at) {
      return fail(ErrorCodes.INVITE_USED, "Este convite já foi utilizado. Crie um novo convite.", 409, undefined, req);
    }

    const tokenPlaintext = generateToken();
    const tokenHash = await hashToken(tokenPlaintext);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const rotatedAt = new Date().toISOString();

    const baseMeta = (invite.metadata && typeof invite.metadata === "object" && !Array.isArray(invite.metadata))
      ? invite.metadata as Record<string, unknown>
      : {};

    const { data: updated, error: updErr } = await supabase
      .from("saas_invites")
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        metadata: {
          ...baseMeta,
          link_rotation: {
            rotated_at: rotatedAt,
            rotated_by_user_id: user.id,
            count: Number((baseMeta as any)?.link_rotation?.count ?? 0) + 1,
          },
        },
      })
      .eq("id", invite.id)
      .is("used_at", null)
      .select("id, empresa_id, email, expires_at")
      .maybeSingle();

    if (updErr) return fail(ErrorCodes.INTERNAL_ERROR, "Erro ao rotacionar convite", 500, undefined, req);
    if (!updated) return fail(ErrorCodes.INVITE_USED, "Convite já utilizado", 409, undefined, req);

    await supabase.from("pe_audit_log").insert({
      actor_user_id: user.id,
      action: "EMPRESA_INVITE_LINK_ROTATED",
      entity_type: "saas_invites",
      entity_id: invite.id,
      metadata: {
        empresa_id: updated.empresa_id,
        email: updated.email,
        expires_at: updated.expires_at,
        email_sent: false,
      },
    });

    // Raw token is returned only in this authorized response; never logged or stored.
    return ok({
      invite_id: updated.id,
      empresa_id: updated.empresa_id,
      email: updated.email,
      expires_at: updated.expires_at,
      activation_url: `${getAppUrl()}/accept-invite?token=${tokenPlaintext}`,
    }, undefined, req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("rotate-empresa-invite error:", msg);
    return fail(ErrorCodes.INTERNAL_ERROR, msg, 500, undefined, req);
  }
});
