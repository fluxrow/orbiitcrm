import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getSystemEmailConfig } from "../_shared/system-email.ts";

const APP_BASE_URL = Deno.env.get("APP_URL") || "https://orbit.fluxrow.pro";
const INTERNAL_NOTIFY_EMAIL = "fbcfarias@icloud.com";

interface Body {
  // Either provide an existing empresa_id, OR provide empresa_nome (+ optional slug) to create a new tenant
  empresa_id?: string;
  empresa_nome?: string;
  slug?: string;
  monthly_price_cents?: number;
  setup_fee_cents?: number;
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
    if (!body.cliente_nome || !body.cliente_email) {
      return fail(ErrorCodes.VALIDATION_ERROR, "cliente_nome e cliente_email são obrigatórios", 400, undefined, req);
    }
    if (!body.empresa_id && !body.empresa_nome) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Informe empresa_id (existente) ou empresa_nome (novo tenant)", 400, undefined, req);
    }

    // Only Fluxrow super admin can create onboardings
    const { data: roleRows } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const isSuper = (roleRows ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper) {
      return fail(ErrorCodes.FORBIDDEN, "Apenas o administrador Fluxrow pode criar onboardings", 403, undefined, req);
    }

    let empresaId = body.empresa_id ?? "";
    let empresaNome = "";
    let empresaSlug = "";

    if (empresaId) {
      const { data: existing } = await supabase
        .from("orbit_empresas").select("slug, nome").eq("id", empresaId).maybeSingle();
      empresaNome = existing?.nome ?? "";
      empresaSlug = existing?.slug ?? "";
    } else {
      // Create new tenant: orbit_empresas + saas_empresa (status=invited)
      const nome = body.empresa_nome!.trim();

      // Generate unique slug
      const { data: slugData, error: slugErr } = await supabase
        .rpc("generate_unique_slug", { p_nome: body.slug?.trim() || nome });
      if (slugErr) {
        return fail(ErrorCodes.INTERNAL_ERROR, `Falha ao gerar slug: ${slugErr.message}`, 500, undefined, req);
      }
      empresaSlug = slugData as string;
      empresaNome = nome;

      const { data: newEmpresa, error: empErr } = await supabase
        .from("orbit_empresas")
        .insert({ nome, slug: empresaSlug, ativo: true, plano: "orbit" })
        .select("id")
        .single();
      if (empErr || !newEmpresa) {
        return fail(ErrorCodes.INTERNAL_ERROR, empErr?.message || "Falha ao criar empresa", 500, undefined, req);
      }
      empresaId = newEmpresa.id;

      // Get the single Orbit plan
      const { data: orbitPlan } = await supabase
        .from("saas_plans").select("id").eq("code", "orbit").maybeSingle();

      const { error: saasErr } = await supabase
        .from("saas_empresa")
        .insert({
          empresa_id: empresaId,
          plan_id: orbitPlan?.id ?? null,
          status: "invited",
          responsible_name: body.cliente_nome,
          responsible_email: body.cliente_email,
          monthly_price_cents_override: body.monthly_price_cents ?? null,
          setup_fee_cents_override: body.setup_fee_cents ?? null,
          invited_at: new Date().toISOString(),
          created_by_user_id: userId,
        });
      if (saasErr) {
        return fail(ErrorCodes.INTERNAL_ERROR, `Empresa criada, mas falhou plano: ${saasErr.message}`, 500, undefined, req);
      }
    }

    // Create onboarding row
    const { data: inserted, error: insErr } = await supabase
      .from("orbit_client_onboardings")
      .insert({
        empresa_id: empresaId,
        cliente_nome: body.cliente_nome,
        cliente_email: body.cliente_email,
        cliente_empresa: body.cliente_empresa ?? empresaNome ?? null,
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

    const empresa = { nome: empresaNome, slug: empresaSlug };

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
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      empresa_slug: empresaSlug,
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
