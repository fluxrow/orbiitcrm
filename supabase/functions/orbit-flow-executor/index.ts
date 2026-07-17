// orbit-flow-executor
// Executes all actions of a given run, in order, recording each step.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";
import { auditZapiSendAttempt } from "../_shared/zapi-audit.ts";
import { getTokenForEmpresa, ensureFreshAccessToken, checkAvailability } from "../_shared/google-calendar.ts";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Json = Record<string, any>;
type StepResult = { ok: boolean; output?: Json; error?: string };

function renderTemplateVars(text: string, vars: Json): string {
  if (!text) return "";
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key) => {
    const v = vars?.[key];
    return v == null ? "" : String(v);
  });
}

async function findOrCreateConversa(empresaId: string, prospectId: string, telefone: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("orbit_conversas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("prospect_id", prospectId)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created, error } = await supabase
    .from("orbit_conversas")
    .insert({
      empresa_id: empresaId,
      prospect_id: prospectId,
      telefone_whatsapp: telefone,
      canal: "whatsapp",
      status: "aberta",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("findOrCreateConversa error", error);
    return null;
  }
  return created?.id ?? null;
}

async function actionSendWhatsappTemplate(cfg: Json, run: Json): Promise<StepResult> {
  const templateSlug = cfg.template_slug || cfg.template_nome || (!cfg.template_id ? cfg.template : undefined);
  if (!cfg.template_id && !templateSlug) return { ok: false, error: "template ausente" };

  const prospectId = run.context?.payload?.prospect_id || (run.entity_type === "prospect" ? run.entity_id : null);
  if (!prospectId) return { ok: false, error: "prospect não identificado" };

  const { data: prospect } = await supabase
    .from("orbit_prospects")
    .select("*")
    .eq("id", prospectId)
    .maybeSingle();
  if (!prospect) return { ok: false, error: "prospect não encontrado" };
  const telefone = (prospect as any).whatsapp || (prospect as any).telefone;
  if (!telefone) return { ok: false, error: "prospect sem telefone" };

  let tplQuery = supabase
    .from("orbit_message_templates")
    .select("id, corpo_texto, nome, imagem_url")
    .eq("empresa_id", run.empresa_id)
    .limit(1);
  if (cfg.template_id) tplQuery = tplQuery.eq("id", cfg.template_id);
  else tplQuery = tplQuery.ilike("nome", `%${templateSlug}%`);
  const { data: tpls } = await tplQuery;
  const tpl = tpls?.[0] as any;
  if (!tpl) return { ok: false, error: "template não encontrado" };

  const p: any = prospect;
  const payloadVars: any = run.context?.payload ?? {};
  const vars: Json = {
    nome:
      p.nome_contato ??
      p.nome ??
      p.nome_razao ??
      p.nome_fantasia ??
      payloadVars.nome ??
      "",
    empresa: p.empresa ?? p.razao_social ?? p.nome_fantasia ?? p.nome_razao ?? "",
    nome_fantasia: p.nome_fantasia ?? p.empresa ?? p.nome_razao ?? "",
    email: p.email ?? p.email_principal ?? "",
    telefone: p.whatsapp ?? p.telefone ?? "",
    cidade: p.cidade ?? "",
    segmento: p.segmento ?? "",
    ...(payloadVars.vars ?? {}),
  };
  const mensagem = renderTemplateVars(tpl.corpo_texto || "", vars);

  const conversaId = await findOrCreateConversa(run.empresa_id, prospectId, telefone);
  if (!conversaId) return { ok: false, error: "não foi possível criar/obter conversa" };

  const nowIso = new Date().toISOString();

  if (cfg.dry_run === true) {
    await supabase.from("orbit_mensagens").insert({
      empresa_id: run.empresa_id,
      conversa_id: conversaId,
      direcao: "OUT",
      mensagem,
      canal: "whatsapp",
      status: "simulated",
      timestamp: nowIso,
    });
    return {
      ok: true,
      output: {
        dry_run: true,
        template_id: tpl.id,
        template_nome: tpl.nome,
        conversa_id: conversaId,
        telefone,
        mensagem,
      },
    };
  }

  let imageResult: any = null;
  if (tpl.imagem_url) {
    imageResult = await sendZapi(run.empresa_id, telefone, "image", { image: tpl.imagem_url, caption: "" });
    await supabase.from("orbit_mensagens").insert({
      empresa_id: run.empresa_id,
      conversa_id: conversaId,
      direcao: "OUT",
      mensagem: "",
      tipo_midia: "image",
      url_midia: tpl.imagem_url,
      canal: "whatsapp",
      status: imageResult.ok ? "enviada" : "falhou",
      erro: imageResult.ok ? null : imageResult.error ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  const textResult = await sendZapi(run.empresa_id, telefone, "text", { message: mensagem });

  await supabase.from("orbit_mensagens").insert({
    empresa_id: run.empresa_id,
    conversa_id: conversaId,
    direcao: "OUT",
    mensagem,
    canal: "whatsapp",
    status: textResult.ok ? "enviada" : "falhou",
    erro: textResult.ok ? null : textResult.error ?? null,
    timestamp: new Date().toISOString(),
  });

  await supabase
    .from("orbit_conversas")
    .update({
      ultima_mensagem_at: new Date().toISOString(),
      ultima_mensagem_preview: (mensagem || "").slice(0, 200),
    })
    .eq("id", conversaId);

  return {
    ok: textResult.ok,
    output: {
      template_id: tpl.id,
      template_nome: tpl.nome,
      conversa_id: conversaId,
      telefone,
      mensagem,
      image_sent: !!tpl.imagem_url,
      image_result: imageResult?.output ?? null,
      zapi: textResult.output ?? null,
    },
    error: textResult.ok ? undefined : textResult.error,
  };
}

async function resolveDealId(run: Json): Promise<string | null> {
  const payloadDealId = (run as any).context?.payload?.deal_id;
  if (payloadDealId) return String(payloadDealId);
  if ((run as any).entity_type === "deal" && (run as any).entity_id) return String((run as any).entity_id);
  const prospectId = (run as any).context?.payload?.prospect_id || ((run as any).entity_type === "prospect" ? (run as any).entity_id : null);
  if (!prospectId) return null;
  const { data, error } = await supabase
    .from("orbit_deals")
    .select("id")
    .eq("empresa_id", (run as any).empresa_id)
    .eq("prospect_id", prospectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[flow-executor] resolveDealId error", error.message);
    return null;
  }
  return (data as any)?.id ?? null;
}

async function actionMoveDealStage(cfg: Json, run: Json): Promise<StepResult> {
  const dealId = await resolveDealId(run);
  if (!dealId) return { ok: false, error: "deal não identificado" };
  if (!cfg.to_stage_id) return { ok: false, error: "to_stage_id ausente" };

  const { error } = await supabase
    .from("orbit_deals")
    .update({ etapa_id: cfg.to_stage_id, moved_at: new Date().toISOString() })
    .eq("id", dealId)
    .eq("empresa_id", run.empresa_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, output: { deal_id: dealId, to_stage_id: cfg.to_stage_id } };
}


// ── Etapa F: novas ações ──────────────────────────────────────────────

async function resolveProspectPhone(prospectId: string): Promise<string | null> {
  const { data } = await supabase
    .from("orbit_prospects")
    .select("telefone, whatsapp")
    .eq("id", prospectId)
    .maybeSingle();
  return (data as any)?.whatsapp || (data as any)?.telefone || null;
}

async function sendZapi(empresaId: string, telefone: string, kind: "text" | "image" | "audio" | "document" | "video", payload: Json) {
  const zapi = await getOrbitZapiRuntimeConfig(supabase, empresaId);
  if (!zapi?.instance_id || !zapi?.token) {
    await auditZapiSendAttempt(supabase, {
      empresa_id: empresaId,
      function_name: "orbit-flow-executor",
      action: `flow_send_${kind}`,
      blocked: true,
      block_reason: "ZAPI_NOT_CONFIGURED",
      payload_summary: { kind, telefone },
    });
    return { ok: false, error: "Z-API não configurado" };
  }

  // ── Trava global/por tenant: envio real só se explicitamente liberado ──
  const blockReason = getOrbitZapiRealSendBlockReason(zapi);
  if (blockReason) {
    console.warn("[executor] envio real bloqueado", { empresaId, kind, reason: blockReason });
    await auditZapiSendAttempt(supabase, {
      empresa_id: empresaId,
      function_name: "orbit-flow-executor",
      action: `flow_send_${kind}`,
      blocked: true,
      block_reason: "ZAPI_REAL_SEND_BLOCKED",
      zapi_config_id: zapi.id,
      payload_summary: { kind, telefone },
    });
    return { ok: false, error: blockReason };
  }

  const base = `https://api.z-api.io/instances/${zapi.instance_id}/token/${zapi.token}`;
  const map: Record<string, string> = {
    text: "send-text", image: "send-image", audio: "send-audio", document: "send-document", video: "send-video",
  };
  const url = `${base}/${map[kind]}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Client-Token": zapi.client_token || "" },
    body: JSON.stringify({ phone: telefone, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, output: j, error: r.ok ? undefined : `Z-API ${r.status}: ${JSON.stringify(j)}` };
}

async function actionSendRichMedia(cfg: Json, run: Json): Promise<StepResult> {
  const tipo = String(cfg.tipo_midia || "").toLowerCase(); // image|audio|document|video
  if (!["image", "audio", "document", "video"].includes(tipo)) return { ok: false, error: "tipo_midia inválido" };
  if (!cfg.url_midia) return { ok: false, error: "url_midia ausente" };

  const prospectId = run.context?.payload?.prospect_id || (run.entity_type === "prospect" ? run.entity_id : null);
  if (!prospectId) return { ok: false, error: "prospect não identificado" };
  const telefone = cfg.telefone || await resolveProspectPhone(prospectId);
  if (!telefone) return { ok: false, error: "prospect sem telefone" };

  const caption = cfg.legenda || cfg.mensagem || "";
  let payload: Json = {};
  if (tipo === "image") payload = { image: cfg.url_midia, caption };
  else if (tipo === "audio") payload = { audio: cfg.url_midia };
  else if (tipo === "video") payload = { video: cfg.url_midia, caption };
  else if (tipo === "document") payload = { document: cfg.url_midia, fileName: cfg.file_name || String(cfg.url_midia).split("/").pop() || "documento" };

  const r = await sendZapi(run.empresa_id, telefone, tipo as any, payload);
  // best-effort logging
  await supabase.from("orbit_webhook_logs").insert({
    empresa_id: run.empresa_id,
    direction: "out",
    event_type: "flow_send_rich_media",
    payload: { tipo, url: cfg.url_midia, telefone, flow_id: run.flow_id },
  }).catch?.(() => {});
  return r;
}

async function actionChangeDealStage(cfg: Json, run: Json): Promise<StepResult> {
  // alias semântico para move_deal_stage, com suporte a to_stage_slug
  let toStageId: string | null = cfg.to_stage_id ?? null;
  if (!toStageId && cfg.to_stage_slug) {
    const { data } = await supabase
      .from("orbit_pipeline_stages")
      .select("id")
      .eq("empresa_id", run.empresa_id)
      .eq("slug", cfg.to_stage_slug)
      .maybeSingle();
    toStageId = (data as any)?.id ?? null;
  }
  if (!toStageId) return { ok: false, error: "to_stage_id/to_stage_slug ausente ou não encontrado" };
  return actionMoveDealStage({ to_stage_id: toStageId }, run);
}

function fmtSlot(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

async function actionCheckCalendarAndOffer(cfg: Json, run: Json): Promise<StepResult> {
  const prospectId = run.context?.payload?.prospect_id || (run.entity_type === "prospect" ? run.entity_id : null);
  if (!prospectId) return { ok: false, error: "prospect não identificado" };
  const telefone = cfg.telefone || await resolveProspectPhone(prospectId);
  if (!telefone) return { ok: false, error: "prospect sem telefone" };

  const tokRow = await getTokenForEmpresa(run.empresa_id);
  if (!tokRow) return { ok: false, error: "Google Calendar não conectado" };
  const access = await ensureFreshAccessToken(tokRow);

  const lookaheadDays = Math.max(1, Math.min(14, Number(cfg.lookahead_days ?? 5)));
  const slotMinutes = Math.max(15, Math.min(180, Number(cfg.slot_minutes ?? 30)));
  const startHour = Math.max(0, Math.min(23, Number(cfg.start_hour ?? 9)));
  const endHour = Math.max(1, Math.min(24, Number(cfg.end_hour ?? 18)));
  const maxOffers = Math.max(1, Math.min(8, Number(cfg.max_offers ?? 3)));
  const tz = tokRow.timezone || "America/Sao_Paulo";

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + lookaheadDays * 86400000).toISOString();
  const { busy } = await checkAvailability(access, tokRow.calendar_id, timeMin, timeMax, tz);
  const busyRanges = (busy ?? []).map((b: any) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as [number, number]);

  // generate candidate slots within working hours of next N days
  const slots: Date[] = [];
  for (let d = 0; d < lookaheadDays && slots.length < maxOffers * 4; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    for (let h = startHour; h + slotMinutes / 60 <= endHour; h += slotMinutes / 60) {
      const start = new Date(day);
      start.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
      if (start.getTime() < now.getTime() + 60 * 60 * 1000) continue; // pelo menos 1h no futuro
      const end = new Date(start.getTime() + slotMinutes * 60000);
      const overlaps = busyRanges.some(([bs, be]) => start.getTime() < be && end.getTime() > bs);
      if (!overlaps) slots.push(start);
      if (slots.length >= maxOffers) break;
    }
    if (slots.length >= maxOffers) break;
  }

  if (!slots.length) {
    const fallback = cfg.fallback_message || "No momento não tenho horários disponíveis. Me diga uma data que prefere e eu confirmo. 😉";
    return await sendZapi(run.empresa_id, telefone, "text", { message: fallback });
  }

  const lines = slots.map((s, i) => `${i + 1}) ${fmtSlot(s, tz)}`);
  const header = cfg.mensagem || "Posso te oferecer estes horários para conversarmos:";
  const footer = cfg.rodape || "Responda com o número da opção que preferir. ✅";
  const message = `${header}\n\n${lines.join("\n")}\n\n${footer}`;

  const r = await sendZapi(run.empresa_id, telefone, "text", { message });
  return { ok: r.ok, output: { offered: slots.map((s) => s.toISOString()), zapi: r.output }, error: r.error };
}



async function actionCreateTask(cfg: Json, run: Json): Promise<StepResult> {
  const prazoDias = Number(cfg.prazo_dias ?? 1);
  const due = new Date(Date.now() + prazoDias * 86400000);
  const dueDate = due.toISOString().slice(0, 10);
  const dealId = await resolveDealId(run);
  const { data, error } = await supabase
    .from("orbit_tasks")
    .insert({
      empresa_id: run.empresa_id,
      titulo: cfg.titulo || "Tarefa de fluxo",
      descricao: cfg.descricao || null,
      due_date: dueDate,
      prospect_id: run.context?.payload?.prospect_id ?? null,
      deal_id: dealId,
      status: "pendente",
      tipo_tarefa: cfg.tipo_tarefa ?? "follow_up",
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, output: { task_id: data?.id } };
}



async function actionToggleAiAgent(cfg: Json, run: Json): Promise<StepResult> {
  const prospectId = run.context?.payload?.prospect_id || (run.entity_type === "prospect" ? run.entity_id : null);
  if (!prospectId) return { ok: false, error: "prospect não identificado" };
  const humanTalk = Boolean(cfg.human_talk);
  const { error } = await supabase
    .from("orbit_conversas")
    .update({ human_talk: humanTalk })
    .eq("empresa_id", run.empresa_id)
    .eq("prospect_id", prospectId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, output: { prospect_id: prospectId, human_talk: humanTalk } };
}

async function actionNotifyVendedor(cfg: Json, run: Json): Promise<StepResult> {
  try {
    const resp = await fetch(`${FUNCTIONS_BASE}/send-vendedor-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        empresa_id: run.empresa_id,
        canal: cfg.canal || "email",
        deal_id: run.context?.payload?.deal_id ?? null,
        prospect_id: run.context?.payload?.prospect_id ?? null,
        triggered_by_flow_id: run.flow_id,
      }),
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, output: json, error: resp.ok ? undefined : `HTTP ${resp.status}` };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ── If/Else (ramificação condicional) ────────────────────────────────

type ConditionOp =
  | "equals" | "not_equals" | "contains" | "not_contains"
  | "gt" | "gte" | "lt" | "lte"
  | "is_empty" | "is_not_empty" | "in";

function getFieldValue(ctx: Json, field: string): any {
  const [scope, ...rest] = String(field || "").split(".");
  const key = rest.join(".");
  const source = ctx?.[scope];
  if (source == null) return undefined;
  if (!key) return source;
  return key.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), source);
}

function evaluateRule(v: any, op: ConditionOp, expected: any): boolean {
  const asNum = (x: any) => (typeof x === "number" ? x : Number(x));
  const strV = (x: any) => (x == null ? "" : String(x));
  switch (op) {
    case "equals": return strV(v) === strV(expected);
    case "not_equals": return strV(v) !== strV(expected);
    case "contains": return strV(v).toLowerCase().includes(strV(expected).toLowerCase());
    case "not_contains": return !strV(v).toLowerCase().includes(strV(expected).toLowerCase());
    case "gt": return asNum(v) > asNum(expected);
    case "gte": return asNum(v) >= asNum(expected);
    case "lt": return asNum(v) < asNum(expected);
    case "lte": return asNum(v) <= asNum(expected);
    case "is_empty":
      return v == null || v === "" || (Array.isArray(v) && v.length === 0);
    case "is_not_empty":
      return !(v == null || v === "" || (Array.isArray(v) && v.length === 0));
    case "in": {
      const list = strV(expected).split(",").map((s: string) => s.trim()).filter(Boolean);
      return list.includes(strV(v));
    }
    default: return false;
  }
}

function isGroup(n: any): boolean {
  return n && typeof n.logic === "string" && !("field" in n);
}

function normalizeGroup(g: any): { logic: "AND" | "OR"; children: any[] } {
  const logic: "AND" | "OR" = g?.logic === "OR" ? "OR" : "AND";
  const children: any[] = [];
  if (Array.isArray(g?.children)) {
    for (const c of g.children) {
      if (isGroup(c)) children.push(normalizeGroup(c));
      else if (c && typeof c.field === "string") children.push(c);
    }
  }
  if (Array.isArray(g?.rules)) {
    for (const r of g.rules) if (r && typeof r.field === "string") children.push(r);
  }
  return { logic, children };
}

function evaluateCondition(ctx: Json, cond: Json, trace?: string[]): boolean {
  const g = normalizeGroup(cond);
  const children = g.children;
  if (!children.length) return true;
  const results = children.map((n: any) => {
    if (isGroup(n)) return evaluateCondition(ctx, n, trace);
    const v = getFieldValue(ctx, n.field);
    const ok = evaluateRule(v, n.op as ConditionOp, n.value);
    trace?.push(`${n.field} ${n.op} ${JSON.stringify(n.value)} → ${JSON.stringify(v)} = ${ok}`);
    return ok;
  });
  return g.logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

async function loadEvalContext(run: Json): Promise<Json> {
  const payload = run.context?.payload ?? {};
  const ctx: Json = { payload, prospect: null, deal: null };
  const prospectId = payload.prospect_id || (run.entity_type === "prospect" ? run.entity_id : null);
  if (prospectId) {
    const { data } = await supabase.from("orbit_prospects").select("*").eq("id", prospectId).maybeSingle();
    ctx.prospect = data ?? null;
  }
  const dealId = payload.deal_id || (run.entity_type === "deal" ? run.entity_id : null);
  if (dealId) {
    const { data } = await supabase.from("orbit_deals").select("*").eq("id", dealId).maybeSingle();
    ctx.deal = data ?? null;
  }
  return ctx;
}

async function actionIfElse(cfg: Json, run: Json): Promise<StepResult> {
  const ctx = await loadEvalContext(run);
  const trace: string[] = [];
  const passed = evaluateCondition(ctx, cfg?.condition ?? {}, trace);
  const branch = passed ? "then" : "else";
  const subActions = Array.isArray(cfg?.[branch]) ? cfg[branch] : [];
  console.log(`[if_else] passed=${passed} branch=${branch} rules=`, trace);
  let executed = 0;
  for (const sub of subActions) {
    if (sub.delay_seconds && sub.delay_seconds > 0) {
      await new Promise((r) => setTimeout(r, Math.min(sub.delay_seconds, 30) * 1000));
    }
    const res = await runAction(sub.action_type, sub.action_config ?? {}, run);
    executed++;
    if (!res.ok) {
      return {
        ok: false,
        error: `[if_else/${branch} #${executed}] ${res.error ?? "erro"}`,
        output: { branch, executed, condition_passed: passed, trace },
      };
    }
  }
  return { ok: true, output: { branch, executed, condition_passed: passed, trace } };
}

async function actionSwitch(cfg: Json, run: Json): Promise<StepResult> {
  const ctx = await loadEvalContext(run);
  const field: string = cfg?.field || "";
  const v = getFieldValue(ctx, field);
  const cases: any[] = Array.isArray(cfg?.cases) ? cfg.cases : [];
  const trace: string[] = [];

  let matched: any = null;
  for (const cc of cases) {
    const op = (cc?.match?.op || "equals") as ConditionOp;
    const val = cc?.match?.value;
    const ok = evaluateRule(v, op, val);
    trace.push(`${cc?.id || "?"}(${cc?.label || ""}): ${field} ${op} ${JSON.stringify(val)} = ${ok}`);
    if (ok) { matched = cc; break; }
  }
  const subActions: any[] = matched
    ? (Array.isArray(matched.actions) ? matched.actions : [])
    : (Array.isArray(cfg?.default?.actions) ? cfg.default.actions : []);
  const branch = matched ? (matched.id || matched.label || "case") : "default";
  console.log(`[switch] field=${field} value=`, v, `branch=${branch}`, trace);

  let executed = 0;
  for (const sub of subActions) {
    if (sub.delay_seconds && sub.delay_seconds > 0) {
      await new Promise((r) => setTimeout(r, Math.min(sub.delay_seconds, 30) * 1000));
    }
    const res = await runAction(sub.action_type, sub.action_config ?? {}, run);
    executed++;
    if (!res.ok) {
      return {
        ok: false,
        error: `[switch/${branch} #${executed}] ${res.error ?? "erro"}`,
        output: { branch, executed, field, value: v, trace },
      };
    }
  }
  return { ok: true, output: { branch, executed, field, value: v, trace } };
}

async function runAction(actionType: string, cfg: Json, run: Json): Promise<StepResult> {
  switch (actionType) {
    case "send_whatsapp_template": return actionSendWhatsappTemplate(cfg, run);
    case "move_deal_stage":        return actionMoveDealStage(cfg, run);
    case "create_task":            return actionCreateTask(cfg, run);
    case "toggle_ai_agent":        return actionToggleAiAgent(cfg, run);
    case "notify_vendedor":        return actionNotifyVendedor(cfg, run);
    case "change_deal_stage":      return actionChangeDealStage(cfg, run);
    case "send_rich_media":        return actionSendRichMedia(cfg, run);
    case "check_calendar_and_offer": return actionCheckCalendarAndOffer(cfg, run);
    case "delay_execution":        return { ok: true, output: { delayed: true } };
    case "if_else":                return actionIfElse(cfg, run);
    case "switch":                 return actionSwitch(cfg, run);
    default: return { ok: false, error: `action_type desconhecido: ${actionType}` };
  }
}

// ── Scheduler helpers ─────────────────────────────────────────────────
const INLINE_DELAY_MAX_SECONDS = 30;

async function enqueueScheduledAction(params: {
  run: Json;
  action: Json;
}): Promise<{ id: string | null; scheduled_for: string }> {
  const { run, action } = params;
  const payload = run.context?.payload ?? {};
  const prospectId = payload.prospect_id ?? (run.entity_type === "prospect" ? run.entity_id : null);
  const dealId = payload.deal_id ?? (run.entity_type === "deal" ? run.entity_id : null);
  const scheduledFor = new Date(Date.now() + Number(action.delay_seconds || 0) * 1000).toISOString();
  const { data, error } = await supabase
    .from("orbit_flow_scheduled_actions")
    .insert({
      empresa_id: run.empresa_id,
      run_id: run.id,
      flow_id: run.flow_id,
      action_id: action.id ?? null,
      ordem: action.ordem ?? 0,
      action_type: action.action_type,
      action_config: action.action_config ?? {},
      context: {
        payload,
        entity_type: run.entity_type ?? null,
        entity_id: run.entity_id ?? null,
      },
      prospect_id: prospectId ?? null,
      deal_id: dealId ?? null,
      scheduled_for: scheduledFor,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    // duplicate (dedupe): já enfileirado — não é erro fatal
    console.warn("[executor] enqueue warn", error.message);
    return { id: null, scheduled_for: scheduledFor };
  }
  return { id: (data as any)?.id ?? null, scheduled_for: scheduledFor };
}

async function handleSingleAction(scheduledId: string): Promise<Response> {
  const { data: sched, error } = await supabase
    .from("orbit_flow_scheduled_actions")
    .select("*")
    .eq("id", scheduledId)
    .maybeSingle();
  if (error || !sched) {
    return new Response(JSON.stringify({ ok: false, error: "scheduled não encontrado" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const s: any = sched;
  // Só executa se worker já reclamou (status=running). Bloqueia execução arbitrária de linhas pending/canceled/success.
  if (s.status !== "running") {
    return new Response(JSON.stringify({ ok: false, error: `status inválido: ${s.status}` }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!s.empresa_id || !s.action_type) {
    return new Response(JSON.stringify({ ok: false, error: "scheduled inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const run: Json = {
    id: s.run_id,
    empresa_id: s.empresa_id,
    flow_id: s.flow_id,
    entity_type: s.context?.entity_type ?? null,
    entity_id: s.context?.entity_id ?? null,
    context: { payload: s.context?.payload ?? {} },
  };

  const stepStart = new Date().toISOString();
  const { data: step } = await supabase
    .from("orbit_flow_run_steps")
    .insert({
      run_id: s.run_id,
      action_id: s.action_id,
      ordem: s.ordem ?? 0,
      status: "running",
      started_at: stepStart,
    })
    .select("id")
    .maybeSingle();

  const result = await runAction(s.action_type, s.action_config ?? {}, run);

  await supabase
    .from("orbit_flow_run_steps")
    .update({
      status: result.ok ? "success" : "error",
      finished_at: new Date().toISOString(),
      output: result.output ?? null,
      error: result.error ?? null,
    })
    .eq("id", (step as any)?.id);

  return new Response(JSON.stringify({ ok: result.ok, data: { scheduled_id: s.id, output: result.output ?? null }, error: result.error ?? null }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal-only: require service-role bearer token
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== SERVICE_KEY) {
    return new Response(JSON.stringify({ ok: false, data: null, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // ── Modo single_action (scheduler-tick): valida linha no DB, ignora action arbitrária. ──
    if (body?.mode === "single_action") {
      const scheduledId = body?.scheduled_id;
      if (!scheduledId || typeof scheduledId !== "string") {
        return new Response(JSON.stringify({ ok: false, error: "scheduled_id obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await handleSingleAction(scheduledId);
    }

    const { run_id } = body;
    if (!run_id) throw new Error("run_id obrigatório");


    const { data: run, error: runErr } = await supabase
      .from("orbit_flow_runs")
      .select("*")
      .eq("id", run_id)
      .maybeSingle();
    if (runErr || !run) throw new Error(runErr?.message || "run não encontrado");

    await supabase
      .from("orbit_flow_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", run_id);

    const { data: actions } = await supabase
      .from("orbit_flow_actions")
      .select("*")
      .eq("flow_id", run.flow_id)
      .order("ordem", { ascending: true });

    let allOk = true;
    let firstError: string | null = null;

    for (const action of actions ?? []) {
      const delay = Number((action as any).delay_seconds ?? 0);
      const stepStart = new Date().toISOString();
      const { data: step } = await supabase
        .from("orbit_flow_run_steps")
        .insert({ run_id, action_id: (action as any).id, ordem: (action as any).ordem, status: "running", started_at: stepStart })
        .select("id")
        .maybeSingle();

      // Delays curtos: comportamento original (inline).
      // Delays > 30s: enfileira e segue para a próxima action sem bloquear.
      if (delay > INLINE_DELAY_MAX_SECONDS) {
        const enq = await enqueueScheduledAction({ run, action: action as any });
        await supabase
          .from("orbit_flow_run_steps")
          .update({
            status: "success",
            finished_at: new Date().toISOString(),
            output: { scheduled: true, scheduled_id: enq.id, scheduled_for: enq.scheduled_for, delay_seconds: delay },
            error: null,
          })
          .eq("id", step?.id);
        continue;
      }

      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay * 1000));
      }

      const result = await runAction((action as any).action_type, (action as any).action_config ?? {}, run);

      await supabase
        .from("orbit_flow_run_steps")
        .update({
          status: result.ok ? "success" : "error",
          finished_at: new Date().toISOString(),
          output: result.output ?? null,
          error: result.error ?? null,
        })
        .eq("id", step?.id);

      if (!result.ok) {
        allOk = false;
        firstError = firstError ?? result.error ?? "erro desconhecido";
        break;
      }
    }

    await supabase
      .from("orbit_flow_runs")
      .update({
        status: allOk ? "success" : "error",
        finished_at: new Date().toISOString(),
        error: firstError,
      })
      .eq("id", run_id);

    return new Response(JSON.stringify({ ok: true, data: { run_id, status: allOk ? "success" : "error" }, error: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("executor error", e);
    return new Response(JSON.stringify({ ok: false, data: null, error: String(e?.message ?? e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
