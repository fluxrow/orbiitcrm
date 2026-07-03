// Orbit Advisor — Scan job (Fase 2a)
// Runs deterministic detectors over each tenant's snapshot and enqueues
// suggestions in orbit_advisor_suggestions. Idempotent via dedupe_key.
//
// Observabilidade (nesta versão):
//   - Logs estruturados JSON com run_id/empresa_id/detector/tempo/contagens.
//   - Persistência de cada execução em orbit_advisor_scan_runs, com métricas
//     agregadas por detector, motivos de bloqueio (advisor_locked_paths) e
//     resultados por tenant.
//
// Invocação:
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
// Structured logging
// ------------------------------------------------------------------
function slog(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

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
  expires_at: string;
  criada_por: "scan";
  status: "pending";
};

// ------------------------------------------------------------------
// Default thresholds (podem ser sobrescritos por tenant via
// orbit_ai_config.advisor_thresholds — merge raso por detector).
// ------------------------------------------------------------------
const DEFAULT_THRESHOLDS = {
  flow_error_spike:        { min_errors: 3,  error_ratio: 0.2, hi_errors: 10 },
  flow_latency_regression: { p95_warn_s: 60, p95_high_s: 180 },
  stage_stagnation:        { min_ativos: 15, window_days: 7 },
  tasks_backlog:           { warn: 10, high: 50 },
  handoff_queue:           { warn: 5 },
  conversas_overflow:      { warn: 50 },
} as const;

type Thresholds = typeof DEFAULT_THRESHOLDS;

function resolveThresholds(snapshot: any): Thresholds {
  const tenant = (snapshot?.ai_config?.advisor_thresholds ?? {}) as Record<string, Record<string, unknown>>;
  const out: any = {};
  for (const [k, defaults] of Object.entries(DEFAULT_THRESHOLDS)) {
    out[k] = { ...defaults, ...(tenant[k] ?? {}) };
  }
  return out as Thresholds;
}

type Detector = {
  name: string;
  run: (empresaId: string, snapshot: any, t: Thresholds) => Suggestion[];
};

function inHours(h: number): string {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}


// ------------------------------------------------------------------
// Deterministic detectors — cheap, no LLM
// ------------------------------------------------------------------
const detectFlowErrorSpike: Detector = {
  name: "flow_error_spike",
  run(empresaId, snapshot, t) {
    const cfg = t.flow_error_spike;
    const out: Suggestion[] = [];
    for (const f of snapshot.flows ?? []) {
      const erros = Number(f.erros_24h ?? 0);
      const runs = Number(f.runs_24h ?? 0);
      if (erros >= cfg.min_errors || (runs > 0 && erros / runs >= cfg.error_ratio)) {
        out.push({
          empresa_id: empresaId,
          tipo: "flow_error_spike",
          titulo: `Fluxo "${f.nome}" acumulou ${erros} erro(s) em 24h`,
          racional:
            `O fluxo executou ${runs}x nas últimas 24h e falhou ${erros}x.` +
            (f.ultimo_erro ? ` Último erro: ${String(f.ultimo_erro).slice(0, 200)}` : ""),
          risco: erros >= cfg.hi_errors ? "alto" : "medio",
          action: {
            kind: "flow_pause",
            target_id: f.id,
            hint: "Pausar o fluxo enquanto o erro raiz é investigado.",
          },
          dedupe_key: `flow_error_spike:${f.id}`,
          expires_at: inHours(6),
          criada_por: "scan",
          status: "pending",
        });
      }
    }
    return out;
  },
};


const detectLatencyRegression: Detector = {
  name: "flow_latency_regression",
  run(empresaId, snapshot) {
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
  },
};

const detectStageStagnation: Detector = {
  name: "stage_stagnation",
  run(empresaId, snapshot) {
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
  },
};

const detectOverloadedKpis: Detector = {
  name: "overloaded_kpis",
  run(empresaId, snapshot) {
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
  },
};

const DETECTORS: Detector[] = [
  detectFlowErrorSpike,
  detectLatencyRegression,
  detectStageStagnation,
  detectOverloadedKpis,
];

// ------------------------------------------------------------------
// Aggregated metrics
// ------------------------------------------------------------------
type DetectorMetric = {
  detector: string;
  runs: number;
  errors: number;
  duration_ms: number;
  suggestions_raw: number;
  suggestions_blocked: number;
  suggestions_created: number;
  suggestions_deduped: number;
};

function newDetectorMetric(name: string): DetectorMetric {
  return {
    detector: name,
    runs: 0,
    errors: 0,
    duration_ms: 0,
    suggestions_raw: 0,
    suggestions_blocked: 0,
    suggestions_created: 0,
    suggestions_deduped: 0,
  };
}

// ------------------------------------------------------------------
// Scan a single tenant
// ------------------------------------------------------------------
async function scanEmpresa(
  runId: string,
  empresaId: string,
  metrics: Map<string, DetectorMetric>,
) {
  const tenantStart = Date.now();
  slog("info", "tenant_scan_start", { run_id: runId, empresa_id: empresaId });

  const { data: snapshot, error: snapErr } = await admin.rpc(
    "get_advisor_snapshot_admin" as any,
    { p_empresa_id: empresaId },
  );
  if (snapErr) throw new Error(`snapshot: ${snapErr.message}`);
  if (!snapshot || (snapshot as any).error) {
    slog("warn", "tenant_scan_skipped", {
      run_id: runId,
      empresa_id: empresaId,
      reason: (snapshot as any)?.error ?? "no_snapshot",
    });
    return {
      empresa_id: empresaId,
      skipped: true,
      reason: (snapshot as any)?.error ?? "no_snapshot",
      duration_ms: Date.now() - tenantStart,
    };
  }

  await admin.from("orbit_advisor_snapshots").insert({ empresa_id: empresaId, snapshot });

  // Rodar detectores medindo cada um
  const locked: string[] = (snapshot as any)?.ai_config?.advisor_locked_paths ?? [];
  const lockedSet = new Set(locked.map(String));

  const detectorResults: Array<{ detector: string; suggestions: Suggestion[] }> = [];
  const perDetectorTiming: Record<string, number> = {};

  for (const detector of DETECTORS) {
    if (!metrics.has(detector.name)) metrics.set(detector.name, newDetectorMetric(detector.name));
    const m = metrics.get(detector.name)!;
    m.runs += 1;
    const dStart = Date.now();
    try {
      const suggestions = detector.run(empresaId, snapshot);
      const dur = Date.now() - dStart;
      m.duration_ms += dur;
      m.suggestions_raw += suggestions.length;
      perDetectorTiming[detector.name] = dur;
      detectorResults.push({ detector: detector.name, suggestions });
      slog("info", "detector_ran", {
        run_id: runId,
        empresa_id: empresaId,
        detector: detector.name,
        duration_ms: dur,
        suggestions: suggestions.length,
      });
    } catch (e) {
      const dur = Date.now() - dStart;
      m.duration_ms += dur;
      m.errors += 1;
      perDetectorTiming[detector.name] = dur;
      slog("error", "detector_failed", {
        run_id: runId,
        empresa_id: empresaId,
        detector: detector.name,
        duration_ms: dur,
        error: (e as Error).message,
      });
    }
  }

  const allSuggestions = detectorResults.flatMap((r) => r.suggestions);
  if (allSuggestions.length === 0) {
    slog("info", "tenant_scan_done", {
      run_id: runId,
      empresa_id: empresaId,
      duration_ms: Date.now() - tenantStart,
      suggestions_created: 0,
    });
    return {
      empresa_id: empresaId,
      snapshot_saved: true,
      suggestions_evaluated: 0,
      suggestions_created: 0,
      suggestions_blocked: 0,
      suggestions_deduped: 0,
      per_detector: perDetectorTiming,
      duration_ms: Date.now() - tenantStart,
    };
  }

  // Aplicar guardrails por advisor_locked_paths
  const blockedByDetector: Record<string, number> = {};
  const rows = allSuggestions.map((s) => {
    const tipoBloqueado = lockedSet.has(s.tipo);
    if (tipoBloqueado) {
      blockedByDetector[s.tipo] = (blockedByDetector[s.tipo] ?? 0) + 1;
      const m = metrics.get(s.tipo);
      if (m) m.suggestions_blocked += 1;
      slog("info", "suggestion_blocked", {
        run_id: runId,
        empresa_id: empresaId,
        detector: s.tipo,
        dedupe_key: s.dedupe_key,
        reason: "advisor_locked_paths",
      });
    }
    return {
      ...s,
      status: tipoBloqueado ? "blocked" : s.status,
      blocked_reason: tipoBloqueado ? "advisor_locked_paths" : null,
    };
  });

  // Dedup manual (índice único é parcial)
  const dedupeKeys = rows.map((r) => r.dedupe_key);
  const { data: existing } = await admin
    .from("orbit_advisor_suggestions")
    .select("dedupe_key,tipo")
    .eq("empresa_id", empresaId)
    .eq("status", "pending")
    .in("dedupe_key", dedupeKeys);
  const existingSet = new Set((existing ?? []).map((r: any) => r.dedupe_key));

  let dedupedCount = 0;
  const toInsert = rows.filter((r) => {
    // rows já marcadas como blocked ainda são inseridas (histórico); só dedupamos as pending
    if (r.status === "pending" && existingSet.has(r.dedupe_key)) {
      dedupedCount += 1;
      const m = metrics.get(r.tipo);
      if (m) m.suggestions_deduped += 1;
      return false;
    }
    return true;
  });

  let insertedCount = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await admin
      .from("orbit_advisor_suggestions")
      .insert(toInsert)
      .select("id,tipo,status");
    if (insErr) {
      slog("error", "suggestions_insert_failed", {
        run_id: runId,
        empresa_id: empresaId,
        error: insErr.message,
      });
      return {
        empresa_id: empresaId,
        error: insErr.message,
        per_detector: perDetectorTiming,
        duration_ms: Date.now() - tenantStart,
      };
    }
    insertedCount = inserted?.length ?? 0;
    for (const row of inserted ?? []) {
      if (row.status === "pending") {
        const m = metrics.get(row.tipo);
        if (m) m.suggestions_created += 1;
      }
    }
  }

  const summary = {
    empresa_id: empresaId,
    snapshot_saved: true,
    suggestions_evaluated: rows.length,
    suggestions_created: insertedCount - Object.values(blockedByDetector).reduce((a, b) => a + b, 0),
    suggestions_blocked: Object.values(blockedByDetector).reduce((a, b) => a + b, 0),
    suggestions_deduped: dedupedCount,
    blocked_by_detector: blockedByDetector,
    per_detector: perDetectorTiming,
    duration_ms: Date.now() - tenantStart,
  };
  slog("info", "tenant_scan_done", { run_id: runId, ...summary });
  return summary;
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

  const runId = crypto.randomUUID();
  const runStart = Date.now();
  const startedAt = new Date().toISOString();
  const metrics = new Map<string, DetectorMetric>();
  let source: "cron" | "manual_service" | "manual_user" = "cron";

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedEmpresa: string | undefined = body?.empresa_id;

    const service = isServiceCall(req);
    let targets: string[] = [];

    if (service) {
      source = requestedEmpresa ? "manual_service" : "cron";
      if (requestedEmpresa) {
        targets = [requestedEmpresa];
      } else {
        const { data, error } = await admin.rpc("list_advisor_scan_targets" as any);
        if (error) throw new Error(`list targets: ${error.message}`);
        targets = (data ?? []).map((r: any) => r.empresa_id);
      }
    } else {
      source = "manual_user";
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

    slog("info", "scan_run_start", {
      run_id: runId,
      source,
      tenants_total: targets.length,
    });

    const results: any[] = [];
    let okCount = 0;
    let errCount = 0;
    for (const empresaId of targets) {
      try {
        const r = await scanEmpresa(runId, empresaId, metrics);
        results.push(r);
        if (r.error) errCount += 1;
        else okCount += 1;
      } catch (e) {
        slog("error", "tenant_scan_failed", {
          run_id: runId,
          empresa_id: empresaId,
          error: (e as Error).message,
        });
        results.push({ empresa_id: empresaId, error: (e as Error).message });
        errCount += 1;
      }
    }

    const aggregated = {
      evaluated: results.reduce((a, r) => a + (r.suggestions_evaluated ?? 0), 0),
      created: results.reduce((a, r) => a + (r.suggestions_created ?? 0), 0),
      blocked: results.reduce((a, r) => a + (r.suggestions_blocked ?? 0), 0),
      deduped: results.reduce((a, r) => a + (r.suggestions_deduped ?? 0), 0),
    };
    const durationMs = Date.now() - runStart;
    const detectorMetricsObj = Object.fromEntries(metrics);

    slog("info", "scan_run_done", {
      run_id: runId,
      source,
      duration_ms: durationMs,
      tenants_ok: okCount,
      tenants_error: errCount,
      ...aggregated,
      detector_metrics: detectorMetricsObj,
    });

    // Persistir execução para status page
    try {
      await admin.from("orbit_advisor_scan_runs").insert({
        id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        source,
        tenants_total: targets.length,
        tenants_ok: okCount,
        tenants_error: errCount,
        suggestions_evaluated: aggregated.evaluated,
        suggestions_created: aggregated.created,
        suggestions_blocked: aggregated.blocked,
        suggestions_deduped: aggregated.deduped,
        detector_metrics: detectorMetricsObj,
        results,
      });
    } catch (persistErr) {
      slog("error", "scan_run_persist_failed", {
        run_id: runId,
        error: (persistErr as Error).message,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          run_id: runId,
          duration_ms: durationMs,
          scanned: results.length,
          ...aggregated,
          detector_metrics: detectorMetricsObj,
          results,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const durationMs = Date.now() - runStart;
    slog("error", "scan_run_fatal", {
      run_id: runId,
      duration_ms: durationMs,
      error: (e as Error).message,
    });
    try {
      await admin.from("orbit_advisor_scan_runs").insert({
        id: runId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        source,
        error: (e as Error).message,
      });
    } catch { /* swallow */ }
    return new Response(
      JSON.stringify({ ok: false, run_id: runId, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
