import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

const APP_BASE_URL = Deno.env.get("APP_URL") || "https://orbit.fluxrow.pro";
const INTERNAL_NOTIFY_EMAIL = "fbcfarias@icloud.com";

interface Body {
  empresa_id: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_empresa?: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsRes?.claims) {
      return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);
    }
    const userId = claimsRes.claims.sub as string;

    const body: Body = await req.json();
    if (!body.empresa_id || !body.cliente_nome || !body.cliente_email) {
      return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id, cliente_nome e cliente_email são obrigatórios", 400, undefined, req);
    }

    // Verify membership
    const { data: roleRows } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const isSuper = (roleRows ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper) {
      const { data: profile } = await supabase
        .from("profiles").select("empresa_id").eq("id", userId).maybeSingle();
      if (profile?.empresa_id !== body.empresa_id) {
        return fail(ErrorCodes.FORBIDDEN, "Usuário não pertence à empresa", 403, undefined, req);
      }
    }

    // Tenant slug for URL
    const { data: empresa } = await supabase
      .from("orbit_empresas").select("slug, nome").eq("id", body.empresa_id).maybeSingle();

    // Create row
    const { data: inserted, error: insErr } = await supabase
      .from("orbit_client_onboardings")
      .insert({
        empresa_id: body.empresa_id,
        cliente_nome: body.cliente_nome,
        cliente_email: body.cliente_email,
        cliente_empresa: body.cliente_empresa ?? null,
        notes: body.notes ?? null,
        status: "enviado",
        sent_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id, public_token")
      .single();

    if (insErr || !inserted) {
      return fail(ErrorCodes.INTERNAL_ERROR, insErr?.message || "Falha ao criar onboarding", 500, undefined, req);
    }

    const publicLink = `${APP_BASE_URL}/onboarding-cliente/${inserted.public_token}`;

    // Send emails (best-effort)
    const { apiKey, fromEmail } = await getSystemEmailConfig(supabase);
    let emailSent = false;
    if (apiKey) {
      const subject = `Onboarding ${empresa?.nome ?? "Orbit CRM"} — vamos começar`;
      const clientHtml = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
          <h1 style="font-size:22px;margin:0 0 12px">Olá, ${escapeHtml(body.cliente_nome)} 👋</h1>
          <p style="font-size:15px;line-height:1.55;color:#334155">
            Tudo pronto para começarmos a implantação do <strong>${empresa?.nome ?? "Orbit CRM"}</strong> para
            ${escapeHtml(body.cliente_empresa ?? "sua empresa")}.
          </p>
          <p style="font-size:15px;line-height:1.55;color:#334155">
            Antes da nossa call de kick-off, preciso que você preencha o onboarding abaixo. São cerca de
            <strong>15 minutos</strong> e suas respostas vão definir como a IA vai conversar com seus leads,
            como o funil será estruturado e quais integrações ativaremos.
          </p>
          <p style="text-align:center;margin:28px 0">
            <a href="${publicLink}"
               style="background:#0f766e;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block">
              Preencher onboarding
            </a>
          </p>
          <p style="font-size:13px;color:#64748b;line-height:1.5">
            Pode pausar e retomar quando quiser — suas respostas são salvas automaticamente.
            Se o botão não funcionar, copie e cole o link no navegador:<br>
            <span style="word-break:break-all">${publicLink}</span>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8">Orbit CRM · Implantação assistida</p>
        </div>`;

      const internalHtml = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 12px">Novo onboarding criado</h2>
          <p><strong>Cliente:</strong> ${escapeHtml(body.cliente_nome)} (${escapeHtml(body.cliente_email)})</p>
          <p><strong>Empresa:</strong> ${escapeHtml(body.cliente_empresa ?? "—")}</p>
          <p><strong>Link público enviado:</strong><br><a href="${publicLink}">${publicLink}</a></p>
        </div>`;

      const send = async (to: string, html: string, subj: string) => {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from: fromEmail, to, subject: subj, html }),
        });
        return r.ok;
      };

      const [a, b] = await Promise.all([
        send(body.cliente_email, clientHtml, subject),
        send(INTERNAL_NOTIFY_EMAIL, internalHtml, `[Orbit] Onboarding enviado para ${body.cliente_nome}`),
      ]);
      emailSent = a && b;
    }

    return ok({
      id: inserted.id,
      public_token: inserted.public_token,
      public_link: publicLink,
      email_sent: emailSent,
    }, undefined, req);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
