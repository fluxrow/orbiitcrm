// orbit-lead-ingest
// Endpoint público para ingestão de leads vindos de fontes externas
// (Typebot, Google Sheets via Apps Script, webhook genérico, form público).
//
// Rota: POST /functions/v1/orbit-lead-ingest/{source_id}
// Headers: x-source-token: <secret_token da orbit_lead_sources>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ok, fail, ErrorCodes } from "../_shared/responses.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function onlyDigits(v: unknown): string {
  return typeof v === "string" || typeof v === "number"
    ? String(v).replace(/\D+/g, "")
    : "";
}

function normalizeBrPhone(v: unknown): string | null {
  const d = onlyDigits(v);
  if (!d) return null;
  // Já está em E.164 BR
  if (d.length === 12 || d.length === 13) return d.startsWith("55") ? d : `55${d}`;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 8) return d; // outros países: mantém só os dígitos
  return null;
}

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let ok = ea.length === eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) {
    if ((ea[i] ?? 0) !== (eb[i] ?? 0)) ok = false;
  }
  return ok;
}

function pickWithMapping(
  payload: Record<string, unknown>,
  mapping: Record<string, unknown>,
  logicalKey: string,
  fallbacks: string[],
): unknown {
  const mapped = mapping?.[logicalKey];
  if (typeof mapped === "string" && mapped in payload) return payload[mapped];
  for (const f of fallbacks) {
    if (f in payload && payload[f] != null && payload[f] !== "") return payload[f];
  }
  return undefined;
}

async function logWebhook(
  sourceId: string,
  status: "received" | "ok" | "error",
  payload: unknown,
  errorMessage?: string,
) {
  try {
    await supabase.from("orbit_webhook_logs").insert({
      event_type: "lead_ingest",
      instance_id: sourceId,
      payload,
      status,
      error_message: errorMessage ?? null,
    });
  } catch (e) {
    console.error("[lead-ingest] log failed", e);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail(ErrorCodes.VALIDATION_ERROR, "Método não permitido", 405, undefined, req);
  }

  // 1) Extrai source_id do path
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const sourceId = parts[parts.length - 1] || "";
  if (!UUID_RE.test(sourceId)) {
    return fail(ErrorCodes.VALIDATION_ERROR, "source_id inválido na URL", 400, undefined, req);
  }

  // 2) Carrega a fonte
  const { data: source, error: sErr } = await supabase
    .from("orbit_lead_sources")
    .select("id, empresa_id, tipo, ativo, secret_token, field_mapping")
    .eq("id", sourceId)
    .maybeSingle();

  if (sErr) {
    console.error("[lead-ingest] source fetch error", sErr);
    return fail(ErrorCodes.INTERNAL_ERROR, "Falha ao carregar a fonte", 500, undefined, req);
  }
  if (!source || !source.ativo) {
    return fail(ErrorCodes.NOT_FOUND, "Fonte não encontrada ou inativa", 404, undefined, req);
  }

  // 3) Valida token em tempo constante
  const provided = req.headers.get("x-source-token") ?? "";
  if (!constantTimeEqual(provided, source.secret_token)) {
    await logWebhook(sourceId, "error", { reason: "invalid_token" }, "invalid_token");
    return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);
  }

  // 4) Rate limit ad-hoc — 60 req/min por fonte
  {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from("orbit_webhook_logs")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "lead_ingest")
      .eq("instance_id", sourceId)
      .gte("created_at", since);
    if ((count ?? 0) >= 60) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "RATE_LIMITED", message: "Muitas requisições para esta fonte" },
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      );
    }
  }

  // 5) Parse body
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("not an object");
    }
  } catch {
    await logWebhook(sourceId, "error", null, "invalid_json");
    return fail(ErrorCodes.VALIDATION_ERROR, "Body JSON inválido", 400, undefined, req);
  }

  // Anti-loop: se veio de um flow, ignora silenciosamente
  if (payload._triggered_by_flow_id) {
    await logWebhook(sourceId, "ok", payload, "skipped_flow_loop");
    return ok({ skipped: true, reason: "triggered_by_flow" }, undefined, req);
  }

  const mapping = (source.field_mapping ?? {}) as Record<string, unknown>;

  // 6) Normaliza campos
  const nome =
    (pickWithMapping(payload, mapping, "nome", ["nome", "name", "full_name", "nome_completo"]) as string | undefined)
      ?.toString()
      .trim() || null;
  const telefone = normalizeBrPhone(
    pickWithMapping(payload, mapping, "telefone", ["telefone", "phone", "whatsapp", "celular", "tel"]),
  );
  const email = normalizeEmail(
    pickWithMapping(payload, mapping, "email", ["email", "email_addr", "e_mail", "mail"]),
  );
  const documento = onlyDigits(
    pickWithMapping(payload, mapping, "documento", ["documento", "cpf", "cnpj", "doc"]),
  );
  const docFinal = documento.length === 11 || documento.length === 14 ? documento : null;
  const tipoDoc = docFinal ? (docFinal.length === 11 ? "PF" : "PJ") : null;

  if (!telefone && !email && !docFinal) {
    await logWebhook(sourceId, "error", payload, "missing_identifiers");
    return fail(
      ErrorCodes.VALIDATION_ERROR,
      "Payload precisa conter ao menos telefone, email ou documento (CPF/CNPJ).",
      400,
      { received_keys: Object.keys(payload) },
      req,
    );
  }

  // 7) Dedupe (documento → telefone → email)
  let existingId: string | null = null;
  {
    const orParts: string[] = [];
    if (docFinal) orParts.push(`cnpj_cpf.eq.${docFinal}`);
    if (telefone) orParts.push(`telefone.eq.${telefone}`, `whatsapp.eq.${telefone}`);
    if (email) orParts.push(`email_principal.eq.${email}`);
    if (orParts.length > 0) {
      const { data: existing } = await supabase
        .from("orbit_prospects")
        .select("id")
        .eq("empresa_id", source.empresa_id)
        .is("deleted_at", null)
        .or(orParts.join(","))
        .limit(1)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }
  }

  const origemLead = `lead_source:${source.tipo}`;
  let prospectId: string;
  let created = false;

  if (existingId) {
    // Merge — atualiza somente campos vazios + mescla dados_adicionais
    const { data: cur } = await supabase
      .from("orbit_prospects")
      .select("nome_razao, telefone, whatsapp, email_principal, cnpj_cpf, tipo_documento, dados_adicionais")
      .eq("id", existingId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      dados_adicionais: { ...(cur?.dados_adicionais ?? {}), ...payload },
    };
    if (nome && !cur?.nome_razao) patch.nome_razao = nome;
    if (telefone && !cur?.telefone) patch.telefone = telefone;
    if (telefone && !cur?.whatsapp) patch.whatsapp = telefone;
    if (email && !cur?.email_principal) patch.email_principal = email;
    if (docFinal && !cur?.cnpj_cpf) {
      patch.cnpj_cpf = docFinal;
      patch.tipo_documento = tipoDoc;
    }

    const { error: uErr } = await supabase
      .from("orbit_prospects")
      .update(patch)
      .eq("id", existingId);
    if (uErr) {
      await logWebhook(sourceId, "error", payload, `update_failed: ${uErr.message}`);
      return fail(ErrorCodes.INTERNAL_ERROR, "Falha ao atualizar prospect", 500, { db: uErr.message }, req);
    }
    prospectId = existingId;
  } else {
    const insertRow = {
      empresa_id: source.empresa_id,
      nome_razao: nome || email || telefone || docFinal || "Lead sem nome",
      telefone: telefone,
      whatsapp: telefone,
      email_principal: email,
      cnpj_cpf: docFinal,
      tipo_documento: tipoDoc,
      tipo: tipoDoc === "PJ" ? "empresa" : "pessoa",
      origem_contato: "PROSPECTS",
      origem_lead: origemLead,
      status_qualificacao: "novo",
      dados_adicionais: payload,
    };
    const { data: ins, error: iErr } = await supabase
      .from("orbit_prospects")
      .insert(insertRow)
      .select("id")
      .maybeSingle();
    if (iErr || !ins) {
      await logWebhook(sourceId, "error", payload, `insert_failed: ${iErr?.message}`);
      return fail(ErrorCodes.INTERNAL_ERROR, "Falha ao criar prospect", 500, { db: iErr?.message }, req);
    }
    prospectId = ins.id;
    created = true;
  }

  // 8) Atualiza contadores da fonte
  const { data: cur } = await supabase
    .from("orbit_lead_sources")
    .select("total_received")
    .eq("id", sourceId)
    .maybeSingle();
  await supabase
    .from("orbit_lead_sources")
    .update({
      last_received_at: new Date().toISOString(),
      total_received: (cur?.total_received ?? 0) + 1,
    })
    .eq("id", sourceId);

  await logWebhook(sourceId, "ok", { prospect_id: prospectId, created });

  // 9) Emite evento `lead_recebido` no motor de fluxos (Etapa B)
  const eventPayload = {
    source_id: sourceId,
    source_tipo: source.tipo,
    prospect_id: prospectId,
    created,
    nome,
    telefone,
    email,
    documento: docFinal,
    raw: payload,
  };
  // Dedupe estável: mesmo lead reenviado pelo Typebot em janela de 10 min
  // gera o mesmo dedupe_key e o INSERT falha (constraint única), impedindo
  // run duplicado. Após 10 min uma nova entrada legítima é permitida.
  const bucket10min = Math.floor(Date.now() / (10 * 60 * 1000));
  const dedupeKey = `lead_recebido:${sourceId}:${prospectId}:${created ? "new" : "merge"}:${bucket10min}`;
  const { error: evErr } = await supabase.from("orbit_flow_events").insert({
    empresa_id: source.empresa_id,
    event_type: "lead_recebido",
    entity_type: "prospect",
    entity_id: prospectId,
    payload: eventPayload,
    dedupe_key: dedupeKey,
  });
  if (evErr) {
    console.error("[lead-ingest] flow event insert error", evErr);
  } else {
    // fire-and-forget: aciona o dispatcher para latência baixa (cron cobre em ≤1min)
    fetch(`${SUPABASE_URL}/functions/v1/orbit-flow-dispatcher`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ trigger: "lead-ingest", event_type: "lead_recebido" }),
    }).catch((e) => console.error("[lead-ingest] dispatcher invoke error", e));
  }

  return ok(
    {
      prospect_id: prospectId,
      created,
      source_id: sourceId,
      empresa_id: source.empresa_id,
      normalized: { nome, telefone, email, documento: docFinal, tipo_documento: tipoDoc },
      flow_event_emitted: !evErr,
    },
    { source_tipo: source.tipo },
    req,
  );
});
