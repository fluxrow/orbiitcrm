// Orbit Advisor — Scan job (Fase 2a)
// Runs deterministic detectors over each tenant's snapshot and enqueues
// suggestions in orbit_advisor_suggestions. Idempotent via dedupe_key.
//
// Invocation:
//   POST /functions/v1/orbit-advisor-scan            → varre todos os tenants ativos
//   POST /functions/v1/orbit-advisor-scan            body { empresa_id } → apenas 1 tenant
//
// Auth: verify_jwt=false. Aceita:
//   - Authorization: Bearer <SERVICE_ROLE_KEY>          (cron / interno)
//   - X-Advisor-Cron-Token: <ADVISOR_CRON_TOKEN>        (opcional, se setado)
//   - Chamada por usuário autenticado só é permitida se o body vier com o
//     próprio empresa_id do usuário (single-tenant scan sob demanda).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-advisor-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_TOKEN = Deno.env.get("ADVISOR_CRON_TOKEN") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ------------------------------------------------------------------
// Detector types
// ------------------------------------------------------------------
type Suggestion = {
  empresa_id: string;
  tipo: string;
  titulo: string;
  racional: string;
  risco: "baixo" | "medio" | "alto";
  action: Record<string, unknown>;
  dedupe_key: string;
  expires_at: string; // iso
  criada_por: "scan";
  status: "pending";
};

function inHours(h: number): string {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}

// ------------------------------------------------------------------
// Deterministic detectors — cheap, no LLM
// ------------------------------------------------------------------
function detectFlowErrorSpike(empresaId: string, snapshot: any): Suggestion[] {
  const out: Suggestion[] = [];
  for (const f of snapshot.flows ?? []) {
    const erros = Number(f.erros_24h ?? 0);
    const runs = Number(f.runs_24h ?? 0);
    if (erros >= 3 || (runs > 0 && erros / runs >= 0.2)) {
      out.push({
        empresa_id: empresaId,
        tipo: "flow_error_spike",
        titulo: `Fluxo "${f.nome}" acumulou ${erros} erro(s) em 24h`,
        racional:
          `O fluxo executou ${runs}x nas últimas 24h e falhou ${erros}x.` +
          (f.ultimo_erro ? ` Último erro: ${String(f.ultimo_erro).slice(0, 200)}` : ""),
        risco: erros >= 10 ? "alto" : "medio",
        action: {
          kind: "flow_inspect",
          target_id: f.id,
          hint: "Revisar orbit_flow_run_steps para o erro raiz antes de propor variação.",
        },
        dedupe_key: `flow_error_spike:${f.id}`,
        expires_at: inHours(6),
        criada_por: "scan",
        status: "pending",
      });
    }
  }
  return out;
}

function detectLatencyRegression(empresaId: string, snapshot: any): Suggestion[] {
  const out: Suggestion[] = [];
  for (const f of snapshot.flows ?? []) {
    const p95 = Number(f.latencia_p95_s ?? 0);
    if (p95 >= 60) {
      out.push({
        empresa_id: empresaId,
        tipo: "flow_latency_regression",
        titulo: `Fluxo "${f.nome}" com p95 de ${p95.toFixed(1)}s`,
        racional:
          `Latência p95 nas últimas 24h ultrapassou 60s (${p95.toFixed(1)}s). ` +
          `Provável gargalo em waits/HTTP externo — considerar reduzir espera ou paralelizar.`,
        risco: p95 >= 180 ? "alto" : "medio",
        action: { kind: "flow_inspect", target_id: f.id, hint: "Rever waits e chamadas externas." },
        dedupe_key: `flow_latency:${f.id}`,
        expires_at: inHours(12),
        criada_por: "scan",
        status: "pending",
      });
    }
  }
  return out;
}

function detectStageStagnation(empresaId: string, snapshot: any): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of snapshot.pipeline ?? []) {
    if (s.is_won || s.is_lost) continue;
    const ativos = Number(s.leads_ativos ?? 0);
    const mov7 = Number(s.mov_7d ?? 0);
    if (ativos >= 15 && mov7 === 0) {
      out.push({
        empresa_id: empresaId,
        tipo: "stage_stagnation",
        titulo: `Etapa "${s.nome}" com ${ativos} leads parados há 7+ dias`,
        racional:
          `Nenhum lead se moveu de "${s.nome}" nos últimos 7 dias, e há ${ativos} ativos. ` +
          `Sugere revisão do critério de avanço ou de um follow-up automático.`,
        risco: "medio",
        action: {
          kind: "stage_inspect",
          target_id: s.id,
          hint: "Considerar variação de fluxo com follow-up para essa etapa.",
        },
        dedupe_key: `stage_stag:${s.id}`,
        expires_at: inHours(24),
        criada_por: "scan",
        status: "pending",
      });
    }
  }
  return out;
}

function detectOverloadedKpis(empresaId: string, snapshot: any): Suggestion[] {
  const out: Suggestion[] = [];
  const k = snapshot.kpis ?? {};
  const tasks = Number(k.tasks_atrasadas ?? 0);
  const handoffs = Number(k.handoffs_pendentes ?? 0);
  const conversas = Number(k.conversas_abertas ?? 0);

  if (tasks >= 10) {
    out.push({
      empresa_id: empresaId,
      tipo: "tasks_backlog",
      titulo: `${tasks} tarefas em atraso`,
      racional: `Tarefas com prazo vencido acumuladas: ${tasks}. Recomenda-se redistribuir ou renegociar prazos.`,
      risco: tasks >= 50 ? "alto" : "medio",
      action: { kind: "tasks_inspect", hint: "Abrir Tarefas e filtrar por atrasadas." },
      dedupe_key: "tasks_backlog",
      expires_at: inHours(12),
      criada_por: "scan",
      status: "pending",
    });
  }
  if (handoffs >= 5) {
    out.push({
      empresa_id: empresaId,
      tipo: "handoff_queue",
      titulo: `${handoffs} handoffs aguardando humano`,
      racional: `Existem ${handoffs} conversas transferidas para humano ainda pendentes.`,
      risco: "medio",
      action: { kind: "handoff_inspect" },
      dedupe_key: "handoff_queue",
      expires_at: inHours(6),
      criada_por: "scan",
      status: "pending",
    });
  }
  if (conversas >= 50) {
    out.push({
      empresa_id: empresaId,
      tipo: "conversas_overflow",
      titulo: `${conversas} conversas abertas simultaneamente`,
      racional:
        `Volume alto de conversas abertas (${conversas}). Considerar automação de encerramento ou reforço no atendimento.`,
      risco: "baixo",
      action: { kind: "conversas_inspect" },
      dedupe_key: "conversas_overflow",
      expires_at: inHours(12),
      criada_por: "scan",
      status: "pending",
    });
  }
  return out;
}

const DETECTORS = [
  detectFlowErrorSpike,
  detectLatencyRegression,
  detectStageStagnation,
  detectOverloadedKpis,
];

// ------------------------------------------------------------------
// Scan a single tenant
// ------------------------------------------------------------------
async function scanEmpresa(empresaId: string) {
  const { data: snapshot, error: snapErr } = await admin.rpc(
    "get_advisor_snapshot_admin" as any,
    { p_empresa_id: empresaId },
  );
  if (snapErr) throw new Error(`snapshot: ${snapErr.message}`);
  if (!snapshot || (snapshot as any).error) {
    return { empresa_id: empresaId, skipped: true, reason: (snapshot as any)?.error ?? "no_snapshot" };
  }

  // Persistir snapshot leve (série temporal)
  await admin.from("orbit_advisor_snapshots").insert({
    empresa_id: empresaId,
    snapshot,
  });

  // Rodar detectores
  const suggestions: Suggestion[] = [];
  for (const detector of DETECTORS) {
    try {
      suggestions.push(...detector(empresaId, snapshot));
    } catch (e) {
      console.error(`[scan] detector failed for ${empresaId}:`, (e as Error).message);
    }
  }

  if (suggestions.length === 0) {
    return { empresa_id: empresaId, snapshot_saved: true, suggestions_created: 0 };
  }

  // Aplicar guardrails: se o path da action estiver em advisor_locked_paths, marca como blocked
  const locked: string[] = (snapshot as any)?.ai_config?.advisor_locked_paths ?? [];
  const lockedSet = new Set(locked.map(String));

  const rows = suggestions.map((s) => {
    const tipoBloqueado = lockedSet.has(s.tipo);
    return {
      ...s,
      status: tipoBloqueado ? "blocked" : s.status,
      blocked_reason: tipoBloqueado ? "advisor_locked_paths" : null,
    };
  });

  // Upsert idempotente por (empresa_id, dedupe_key) apenas onde status='pending'.
  // Fazemos INSERT ... ON CONFLICT DO NOTHING para não sobrescrever sugestões já geradas.
  const { data: inserted, error: insErr } = await admin
    .from("orbit_advisor_suggestions")
    .upsert(rows, {
      onConflict: "empresa_id,dedupe_key",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insErr) {
    console.error(`[scan] insert failed for ${empresaId}:`, insErr.message);
    return { empresa_id: empresaId, error: insErr.message };
  }

  return {
    empresa_id: empresaId,
    snapshot_saved: true,
    suggestions_evaluated: rows.length,
    suggestions_created: inserted?.length ?? 0,
  };
}

// ------------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------------
function isServiceCall(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token && token === SERVICE_ROLE) return true;
  const cron = req.headers.get("x-advisor-cron-token") ?? "";
  if (CRON_TOKEN && cron && cron === CRON_TOKEN) return true;
  return false;
}

async function empresaFromUserJwt(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data } = await user.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await user
    .from("profiles")
    .select("empresa_id")
    .eq("id", data.user.id)
    .maybeSingle();
  return (profile?.empresa_id as string) ?? null;
}

// ------------------------------------------------------------------
// HTTP handler
// ------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedEmpresa: string | undefined = body?.empresa_id;

    const service = isServiceCall(req);
    let targets: string[] = [];

    if (service) {
      if (requestedEmpresa) {
        targets = [requestedEmpresa];
      } else {
        const { data, error } = await admin.rpc("list_advisor_scan_targets" as any);
        if (error) throw new Error(`list targets: ${error.message}`);
        targets = (data ?? []).map((r: any) => r.empresa_id);
      }
    } else {
      // usuário autenticado só pode scanear a própria empresa
      const userEmpresa = await empresaFromUserJwt(req);
      if (!userEmpresa) {
        return new Response(
          JSON.stringify({ ok: false, error: "unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (requestedEmpresa && requestedEmpresa !== userEmpresa) {
        return new Response(
          JSON.stringify({ ok: false, error: "forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      targets = [userEmpresa];
    }

    console.log(`[scan] processing ${targets.length} tenant(s)`);
    const results = [];
    for (const empresaId of targets) {
      try {
        results.push(await scanEmpresa(empresaId));
      } catch (e) {
        console.error(`[scan] tenant ${empresaId} failed:`, (e as Error).message);
        results.push({ empresa_id: empresaId, error: (e as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, data: { scanned: results.length, results } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[scan] fatal:", (e as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
