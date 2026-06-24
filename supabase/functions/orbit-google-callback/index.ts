// Callback público do OAuth Google: troca code → tokens, persiste, redireciona
import { svcClient, exchangeCode, fetchGoogleEmail } from "../_shared/google-calendar.ts";

function normalizeAppUrl(u: string): string {
  let url = (u || "").trim();
  if (!url) return "https://orbit.fluxrow.pro";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

const APP_URL = normalizeAppUrl(Deno.env.get("APP_URL") ?? "https://orbit.fluxrow.pro");

function htmlRedirect(target: string, _message?: string): Response {
  // 302 redirect direto — evita problemas de renderização de HTML pelo runtime
  return new Response(null, { status: 302, headers: { Location: target } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const fallback = `${APP_URL}/orbit/config?tab=agenda`;

    if (error) return htmlRedirect(`${fallback}&google=error&reason=${encodeURIComponent(error)}`, "Conexão cancelada");
    if (!code || !state) return htmlRedirect(`${fallback}&google=error&reason=missing_params`, "Parâmetros inválidos");

    const supa = svcClient();
    const { data: st } = await supa.from("orbit_google_oauth_states").select("*").eq("state", state).maybeSingle();
    if (!st) return htmlRedirect(`${fallback}&google=error&reason=invalid_state`, "Estado inválido");
    if (new Date(st.expires_at).getTime() < Date.now()) {
      await supa.from("orbit_google_oauth_states").delete().eq("state", state);
      return htmlRedirect(`${fallback}&google=error&reason=expired`, "Sessão expirada");
    }

    const tok = await exchangeCode(code);
    if (!tok.refresh_token) {
      // Google só devolve refresh_token na 1ª autorização. Forçamos prompt=consent no auth, então isto é raro.
      return htmlRedirect(`${fallback}&google=error&reason=no_refresh`, "Sem refresh token — revogue acesso e tente de novo");
    }

    const email = await fetchGoogleEmail(tok.access_token);
    const expiresAt = new Date(Date.now() + (tok.expires_in - 30) * 1000).toISOString();

    const { error: upErr } = await supa.from("orbit_google_tokens").upsert({
      empresa_id: st.empresa_id,
      user_id: st.user_id,
      google_email: email,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: expiresAt,
      scope: tok.scope,
    }, { onConflict: "empresa_id" });

    if (upErr) {
      console.error("[orbit-google-callback] upsert", upErr);
      return htmlRedirect(`${fallback}&google=error&reason=db_error`, "Erro ao salvar token");
    }

    await supa.from("orbit_google_oauth_states").delete().eq("state", state);

    const target = st.redirect_after || `${fallback}&google=ok`;
    return htmlRedirect(target, "Google Calendar conectado ✅");
  } catch (e) {
    console.error("[orbit-google-callback]", e);
    return htmlRedirect(`${APP_URL}/orbit/config?tab=agenda&google=error&reason=server`, "Erro no servidor");
  }
});
