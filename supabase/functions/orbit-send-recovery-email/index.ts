/**
 * orbit-send-recovery-email
 *
 * Envia o e-mail de recuperação de senha via Resend usando a identidade
 * do sistema (Orbit CRM <orbit@fluxrow.pro>) — mesma config dos demais
 * emails de plataforma (system-email.ts).
 *
 * Fluxo:
 *  1. Recebe { email } do frontend.
 *  2. Gera link de recovery via supabase.auth.admin.generateLink (service role).
 *  3. Envia HTML branded via Resend.
 *  4. SEMPRE retorna 200 OK neutro — nunca revela se o e-mail existe.
 *
 * verify_jwt = false (usuário não está autenticado nesse momento).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://orbit.fluxrow.pro";

function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return false;
  // Simple, permissive email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const maskedUser = user.length <= 2
    ? "*".repeat(user.length)
    : user[0] + "*".repeat(Math.max(1, user.length - 2)) + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

function buildHtml(actionLink: string): string {
  // Template inline (compatível com clientes de e-mail) com identidade Orbit.
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recuperação de senha - Orbit</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e8ef;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0b0d12;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:linear-gradient(180deg,#11141b 0%,#0e1118 100%);border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0 32px;">
              <div style="font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:#8a93a6;font-weight:600;">Orbit CRM</div>
              <h1 style="margin:12px 0 0 0;font-size:24px;line-height:1.3;font-weight:700;color:#ffffff;">Redefinição de senha</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:20px 32px 8px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#c8cdda;">
                Recebemos uma solicitação para redefinir a senha da sua conta no Orbit.
              </p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#c8cdda;">
                Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong style="color:#ffffff;">60 minutos</strong> e só pode ser usado uma vez.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:8px 32px 28px 32px;">
              <a href="${actionLink}" target="_blank"
                 style="display:inline-block;background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px;box-shadow:0 8px 24px -8px rgba(99,102,241,0.6);">
                Redefinir senha
              </a>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#8a93a6;">
                Se o botão não funcionar, copie e cole este endereço no seu navegador:
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;color:#9ba3b6;">
                <a href="${actionLink}" style="color:#a5b4fc;text-decoration:underline;">${actionLink}</a>
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background-color:rgba(255,255,255,0.06);"></div>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding:20px 32px 28px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#8a93a6;">
                Se você não solicitou esta redefinição, ignore este e-mail — sua senha permanecerá inalterada e nenhuma ação será tomada.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px 28px 32px;background-color:rgba(255,255,255,0.02);">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7184;text-align:center;">
                © ${new Date().getFullYear()} Orbit CRM · Este é um e-mail automático, não responda.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return fail(ErrorCodes.VALIDATION_ERROR, "Method not allowed", 405);
  }

  let payload: { email?: unknown };
  try {
    payload = await req.json();
  } catch {
    return fail(ErrorCodes.VALIDATION_ERROR, "Invalid JSON body", 400);
  }

  const rawEmail = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";

  // Anti-enumeração: input inválido também responde 200 OK neutro.
  if (!isValidEmail(rawEmail)) {
    console.log("[recovery] invalid_email_format — returning neutral OK");
    return ok({ sent: true });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[recovery] missing Supabase service env vars");
    // Mesmo assim retorna neutro pro cliente.
    return ok({ sent: true });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Gera o link de recovery (não dispara o email default do Supabase).
  let actionLink: string | null = null;
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: rawEmail,
      options: {
        redirectTo: `${APP_URL.replace(/\/+$/, "")}/reset-password`,
      },
    });

    if (error) {
      // Usuário não existe ou outro erro → resposta neutra.
      console.log(
        `[recovery] generateLink no-op for ${maskEmail(rawEmail)}: ${error.message}`,
      );
      return ok({ sent: true });
    }

    actionLink = data?.properties?.action_link ?? null;
  } catch (e) {
    console.error("[recovery] generateLink threw:", (e as Error).message);
    return ok({ sent: true });
  }

  if (!actionLink) {
    console.log(`[recovery] no action_link for ${maskEmail(rawEmail)}`);
    return ok({ sent: true });
  }

  // 2) Envia via Resend usando a identidade do sistema.
  try {
    const { apiKey, fromEmail } = await getSystemEmailConfig(supabase);
    if (!apiKey) {
      console.error("[recovery] no Resend API key configured");
      return ok({ sent: true });
    }

    const html = buildHtml(actionLink);

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [rawEmail],
        subject: "Recuperação de senha - Orbit",
        html,
      }),
    });

    if (!resendResp.ok) {
      const errBody = await resendResp.text().catch(() => "");
      console.error(
        `[recovery] resend send failed (${resendResp.status}) for ${maskEmail(rawEmail)}: ${errBody}`,
      );
    } else {
      console.log(`[recovery] sent OK to ${maskEmail(rawEmail)}`);
    }
  } catch (e) {
    console.error("[recovery] resend threw:", (e as Error).message);
  }

  // Sempre neutro.
  return ok({ sent: true });
});
