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

import { getOrbitZapiRuntimeConfig } from "../_shared/orbit-zapi.ts";
import { getTokenForEmpresa, ensureFreshAccessToken, checkAvailability } from "../_shared/google-calendar.ts";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Json = Record<string, any>;
type StepResult = { ok: boolean; output?: Json; error?: string };

async function actionSendWhatsappTemplate(cfg: Json, run: Json): Promise<StepResult> {
  const templateSlug = cfg.template_slug || cfg.template_id;
  if (!templateSlug) return { ok: false, error: "template ausente" };

  const prospectId = run.context?.payload?.prospect_id || (run.entity_type === "prospect" ? run.entity_id : null);
  if (!prospectId) return { ok: false, error: "prospect não identificado" };

  const { data: prospect } = await supabase
    .from("orbit_prospects")
    .select("telefone, whatsapp, empresa_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (!prospect?.telefone && !prospect?.whatsapp) return { ok: false, error: "prospect sem telefone" };

  const tplQuery = supabase
    .from("orbit_message_templates")
    .select("id, conteudo, nome")
    .eq("empresa_id", run.empresa_id)
    .limit(1);
  const { data: tpls } = cfg.template_id
    ? await tplQuery.eq("id", cfg.template_id)
    : await tplQuery.ilike("nome", `%${templateSlug}%`);

  const tpl = tpls?.[0];
  if (!tpl) return { ok: false, error: "template não encontrado" };

  const resp = await fetch(`${FUNCTIONS_BASE}/orbit-send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      empresa_id: run.empresa_id,
      telefone: prospect.whatsapp || prospect.telefone,
      mensagem: tpl.conteudo,
      prospect_id: prospectId,
      triggered_by_flow_id: run.flow_id,
    }),
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, output: json, error: resp.ok ? undefined : json?.error || `HTTP ${resp.status}` };
}

async function actionMoveDealStage(cfg: Json, run: Json): Promise<StepResult> {
  const dealId = run.context?.payload?.deal_id || (run.entity_type === "deal" ? run.entity_id : null);
  if (!dealId) return { ok: false, error: "deal não identificado" };
  if (!cfg.to_stage_id) return { ok: false, error: "to_stage_id ausente" };

  const { error } = await supabase
    .from("orbit_deals")
    .update({ etapa_id: cfg.to_stage_id })
    .eq("id", dealId)
    .eq("empresa_id", run.empresa_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, output: { deal_id: dealId, to_stage_id: cfg.to_stage_id } };
}

async function actionCreateTask(cfg: Json, run: Json): Promise<StepResult> {
  const prazoDias = Number(cfg.prazo_dias ?? 1);
  const due = new Date(Date.now() + prazoDias * 86400000);
  const dueDate = due.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("orbit_tasks")
    .insert({
      empresa_id: run.empresa_id,
      titulo: cfg.titulo || "Tarefa de fluxo",
      descricao: cfg.descricao || null,
      due_date: dueDate,
      prospect_id: run.context?.payload?.prospect_id ?? null,
      deal_id: run.context?.payload?.deal_id ?? (run.entity_type === "deal" ? run.entity_id : null),
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

async function runAction(actionType: string, cfg: Json, run: Json): Promise<StepResult> {
  switch (actionType) {
    case "send_whatsapp_template": return actionSendWhatsappTemplate(cfg, run);
    case "move_deal_stage":        return actionMoveDealStage(cfg, run);
    case "create_task":            return actionCreateTask(cfg, run);
    case "toggle_ai_agent":        return actionToggleAiAgent(cfg, run);
    case "notify_vendedor":        return actionNotifyVendedor(cfg, run);
    default: return { ok: false, error: `action_type desconhecido: ${actionType}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { run_id } = await req.json();
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
      const stepStart = new Date().toISOString();
      const { data: step } = await supabase
        .from("orbit_flow_run_steps")
        .insert({ run_id, action_id: action.id, ordem: action.ordem, status: "running", started_at: stepStart })
        .select("id")
        .maybeSingle();

      if (action.delay_seconds > 0) {
        await new Promise((r) => setTimeout(r, Math.min(action.delay_seconds, 30) * 1000));
      }

      const result = await runAction(action.action_type, action.action_config ?? {}, run);

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
