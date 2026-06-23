// Callback público do OAuth Google: troca code → tokens, persiste, redireciona
import { svcClient, exchangeCode, fetchGoogleEmail } from "../_shared/google-calendar.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.orbiitcrm.com.br";

function htmlRedirect(target: string, message?: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Google Calendar</title>
<meta http-equiv="refresh" content="2;url=${target}">
<style>body{font-family:system-ui;background:#0a0a1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{max-width:480px;text-align:center;padding:32px;border:1px solid rgba(255,255,255,.1);border-radius:16px}
a{color:#818cf8}</style></head>
<body><div class="box"><h2>${message ?? "Conectado!"}</h2>
<p>Redirecionando para o Orbit…</p><p><a href="${target}">Voltar agora</a></p></div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
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
