// Observabilidade global da Anthropic, exclusiva para Super Admin.
//
// - `read` devolve apenas o snapshot persistido (zero token de IA).
// - `refresh` executa um probe de 1 token e, quando configurada, consulta a
//   Cost API administrativa oficial da Anthropic.
// - Nenhuma chave, prompt, completion ou PII de tenant é persistida/retornada.
// - Alertas de plataforma usam somente e-mail do sistema; nunca a Z-API de um
//   tenant.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ANTHROPIC_DEFAULT_MODEL,
  callAnthropic,
} from "../_shared/anthropic.ts";
import { getSystemEmailCandidates } from "../_shared/system-email.ts";
import {
  aggregateAnthropicCosts,
  type AnthropicCostBucket,
  type CostMetrics,
  providerAlertMessage,
  type ProviderHealthStatus,
  type ProviderMonitorConfig,
  resolveProviderHealthStatus,
} from "../_shared/ai-provider-health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-provider-health-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const COST_REPORT_URL =
  "https://api.anthropic.com/v1/organizations/cost_report";
const ANTHROPIC_VERSION = "2023-06-01";
const PROVIDER = "anthropic";
const MAX_COST_PAGES = 24;
const REFRESH_THROTTLE_MS = 30_000;

type AuthContext = { kind: "super_admin" | "service"; actorId: string | null };

interface MonitorConfigRow extends ProviderMonitorConfig {
  provider: string;
  enabled: boolean;
  alert_email: string;
  alert_cooldown_minutes: number;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string {
  const value = req.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function authorize(
  req: Request,
  service: SupabaseClient,
): Promise<AuthContext | null> {
  const token = bearerToken(req);
  if (token && token === SERVICE_ROLE_KEY) {
    return { kind: "service", actorId: null };
  }

  const cronToken = Deno.env.get("ORBIT_PROVIDER_HEALTH_CRON_TOKEN") ?? "";
  const providedCronToken = req.headers.get("x-provider-health-token") ?? "";
  if (cronToken && providedCronToken && providedCronToken === cronToken) {
    return { kind: "service", actorId: null };
  }

  if (!token) return null;
  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    },
  );
  const { data: userData, error: userError } = await userClient.auth.getUser(
    token,
  );
  if (userError || !userData.user) return null;

  const { data: allowed, error: roleError } = await service.rpc(
    "pe_is_super_admin",
    {
      p_user_id: userData.user.id,
    },
  );
  if (roleError || allowed !== true) return null;
  return { kind: "super_admin", actorId: userData.user.id };
}

function adminCostHeaders(): {
  configured: boolean;
  headers: Record<string, string>;
} {
  const oauthToken = Deno.env.get("ANTHROPIC_ADMIN_OAUTH_TOKEN") ?? "";
  const adminKey = Deno.env.get("ANTHROPIC_ADMIN_API_KEY") ?? "";
  if (oauthToken) {
    return {
      configured: true,
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        "anthropic-version": ANTHROPIC_VERSION,
      },
    };
  }
  if (adminKey) {
    return {
      configured: true,
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
    };
  }
  return { configured: false, headers: {} };
}

async function fetchAnthropicCosts(
  config: MonitorConfigRow,
  now: Date,
): Promise<
  {
    configured: boolean;
    ok: boolean;
    buckets: AnthropicCostBucket[];
    status: number | null;
    code: string | null;
  }
> {
  const admin = adminCostHeaders();
  if (!admin.configured) {
    return {
      configured: false,
      ok: false,
      buckets: [],
      status: null,
      code: "admin_api_not_configured",
    };
  }

  const thirtyDaysAgo = now.getTime() - 31 * 86_400_000;
  const baselineStart = config.baseline_recorded_at
    ? Date.parse(config.baseline_recorded_at)
    : Number.POSITIVE_INFINITY;
  // Quando existe baseline, preserve o timestamp exato para que o primeiro
  // bucket represente custos posteriores à leitura manual do saldo.
  const startingAt = new Date(Math.min(baselineStart, thirtyDaysAgo))
    .toISOString();
  const endingAt = now.toISOString();
  const buckets: AnthropicCostBucket[] = [];
  let page: string | null = null;

  for (let i = 0; i < MAX_COST_PAGES; i += 1) {
    const url = new URL(COST_REPORT_URL);
    url.searchParams.set("starting_at", startingAt);
    url.searchParams.set("ending_at", endingAt);
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "31");
    if (page) url.searchParams.set("page", page);

    let response: Response;
    try {
      response = await fetch(url, { headers: admin.headers });
    } catch {
      return {
        configured: true,
        ok: false,
        buckets: [],
        status: 502,
        code: "cost_api_network",
      };
    }
    if (!response.ok) {
      return {
        configured: true,
        ok: false,
        buckets: [],
        status: response.status,
        code: response.status === 401 || response.status === 403
          ? "cost_api_auth"
          : "cost_api_error",
      };
    }

    const payload = await response.json().catch(() => ({}));
    if (Array.isArray(payload?.data)) buckets.push(...payload.data);
    if (
      !payload?.has_more || typeof payload?.next_page !== "string" ||
      !payload.next_page
    ) break;
    page = payload.next_page;
  }

  return { configured: true, ok: true, buckets, status: 200, code: null };
}

async function readSnapshot(service: SupabaseClient) {
  const [
    { data: config, error: configError },
    { data: health, error: healthError },
    { data: alerts, error: alertsError },
  ] = await Promise.all([
    service.from("orbit_ai_provider_monitor_config").select("*").eq(
      "provider",
      PROVIDER,
    ).single(),
    service.from("orbit_ai_provider_health").select("*").eq(
      "provider",
      PROVIDER,
    ).single(),
    service.from("orbit_ai_provider_alert_events")
      .select(
        "id, provider, severity, event_type, status, message, metrics, email_sent, email_error, last_notified_at, created_at, resolved_at",
      )
      .eq("provider", PROVIDER).order("created_at", { ascending: false }).limit(
        20,
      ),
  ]);
  const error = configError ?? healthError ?? alertsError;
  if (error) throw new Error(`snapshot_read_failed:${error.code ?? "unknown"}`);
  return { config, health, recent_alerts: alerts ?? [] };
}

function alertSeverity(
  status: ProviderHealthStatus,
): "warning" | "critical" | null {
  if (status === "warning") return "warning";
  if (["critical", "depleted", "degraded"].includes(status)) return "critical";
  return null;
}

async function sendAlertEmail(
  service: SupabaseClient,
  recipient: string,
  status: ProviderHealthStatus,
  metrics: CostMetrics,
  dedupeKey: string,
): Promise<{ sent: boolean; providerId: string | null; error: string | null }> {
  const candidates = await getSystemEmailCandidates(service);
  if (candidates.length === 0) {
    return {
      sent: false,
      providerId: null,
      error: "system_email_not_configured",
    };
  }

  const subject = status === "depleted"
    ? "[Orbit] Crédito da Anthropic esgotado"
    : status === "critical"
    ? "[Orbit] Crédito da Anthropic em nível crítico"
    : status === "degraded"
    ? "[Orbit] Falha no monitor da Anthropic"
    : "[Orbit] Crédito da Anthropic em nível de atenção";
  const summary = providerAlertMessage(status, metrics);
  const emailIdempotencyKey = dedupeKey.replace(/[^a-zA-Z0-9_-]/g, "-");
  const html =
    `<h2>${subject}</h2><p>${summary}</p><p>Consulte o painel de Super Admin do Orbit e o Console da Anthropic antes de recarregar créditos.</p><p><small>O saldo exibido pelo Orbit é estimado a partir do baseline informado e dos custos oficiais.</small></p>`;

  let lastError = "email_send_failed";
  for (const candidate of candidates) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidate.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `orbit-provider-health-${emailIdempotencyKey}`,
        },
        body: JSON.stringify({
          from: candidate.fromEmail,
          to: [recipient],
          subject,
          html,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        return {
          sent: true,
          providerId: typeof body?.id === "string" ? body.id : null,
          error: null,
        };
      }
      lastError = `resend_http_${response.status}`;
      if (![401, 403].includes(response.status)) break;
    } catch {
      lastError = "resend_network_error";
    }
  }
  return { sent: false, providerId: null, error: lastError };
}

async function updateAlerts(
  service: SupabaseClient,
  config: MonitorConfigRow,
  status: ProviderHealthStatus,
  metrics: CostMetrics,
  now: Date,
) {
  const severity = alertSeverity(status);
  if (!severity) {
    const { error } = await service.from("orbit_ai_provider_alert_events")
      .update({ status: "recovered", resolved_at: now.toISOString() })
      .eq("provider", PROVIDER).eq("status", "open");
    if (error) throw new Error(`alert_recovery_failed:${error.code ?? "unknown"}`);
    return;
  }

  const dedupeKey = `${PROVIDER}:${status}`;
  const { error: resolveError } = await service.from("orbit_ai_provider_alert_events")
    .update({ status: "recovered", resolved_at: now.toISOString() })
    .eq("provider", PROVIDER).eq("status", "open").neq("dedupe_key", dedupeKey);
  if (resolveError) throw new Error(`alert_transition_failed:${resolveError.code ?? "unknown"}`);

  const message = providerAlertMessage(status, metrics);
  const { data: openAlert, error: openAlertError } = await service.from(
    "orbit_ai_provider_alert_events",
  )
    .select("id, last_notified_at").eq("provider", PROVIDER)
    .eq("dedupe_key", dedupeKey).eq("status", "open").maybeSingle();
  if (openAlertError) throw new Error(`alert_read_failed:${openAlertError.code ?? "unknown"}`);
  const lastNotifiedAt = openAlert?.last_notified_at
    ? Date.parse(openAlert.last_notified_at)
    : 0;
  const stillCoolingDown = Number.isFinite(lastNotifiedAt) &&
    now.getTime() - lastNotifiedAt <
      Number(config.alert_cooldown_minutes) * 60_000;
  if (stillCoolingDown) return;

  const alertRow = {
    provider: PROVIDER,
    severity,
    event_type: status === "degraded"
      ? "provider_monitor_failure"
      : "provider_credit_threshold",
    status: "open",
    dedupe_key: dedupeKey,
    message,
    metrics: {
      estimated_balance_usd: metrics.estimated_balance_usd,
      projected_days_remaining: metrics.projected_days_remaining,
      cost_7d_usd: metrics.cost_7d_usd,
    },
    email_sent: false,
    email_provider_id: null,
    email_error: "pending",
    last_notified_at: now.toISOString(),
  };
  let alertId: string;
  if (openAlert?.id) {
    const { data: claimed, error: claimError } = await service
      .from("orbit_ai_provider_alert_events").update(alertRow)
      .eq("id", openAlert.id).select("id").single();
    if (claimError || !claimed?.id) {
      throw new Error(`alert_claim_failed:${claimError?.code ?? "unknown"}`);
    }
    alertId = claimed.id;
  } else {
    const { data: claimed, error: claimError } = await service
      .from("orbit_ai_provider_alert_events").insert(alertRow).select("id").single();
    // Outro refresh simultâneo venceu a corrida de dedupe; ele será o emissor.
    if (claimError?.code === "23505") return;
    if (claimError || !claimed?.id) {
      throw new Error(`alert_claim_failed:${claimError?.code ?? "unknown"}`);
    }
    alertId = claimed.id;
  }

  const notificationWindow = Math.floor(
    now.getTime() / (Number(config.alert_cooldown_minutes) * 60_000),
  );
  const email = await sendAlertEmail(
    service,
    config.alert_email,
    status,
    metrics,
    `${dedupeKey}:${notificationWindow}`,
  );
  const { error: emailAuditError } = await service.from("orbit_ai_provider_alert_events")
    .update({
      email_sent: email.sent,
      email_provider_id: email.providerId,
      email_error: email.error,
    }).eq("id", alertId);
  if (emailAuditError) {
    throw new Error(`alert_email_audit_failed:${emailAuditError.code ?? "unknown"}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED" } });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: { code: "SERVER_CONFIG_MISSING" } });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const auth = await authorize(req, service);
  if (!auth) {
    return json(403, { ok: false, error: { code: "SUPER_ADMIN_REQUIRED" } });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action === "refresh" ? "refresh" : "read";
  try {
    if (action === "read") {
      return json(200, { ok: true, data: await readSnapshot(service) });
    }

    const { data: rawConfig, error: configError } = await service
      .from("orbit_ai_provider_monitor_config").select("*").eq(
        "provider",
        PROVIDER,
      ).single();
    if (configError || !rawConfig) throw new Error("monitor_config_missing");
    const config = rawConfig as MonitorConfigRow;
    if (!config.enabled) {
      return json(200, {
        ok: true,
        data: await readSnapshot(service),
        skipped: "monitor_disabled",
      });
    }

    const now = new Date();
    const previous = await service.from("orbit_ai_provider_health")
      .select("consecutive_failures, last_success_at, last_checked_at")
      .eq("provider", PROVIDER).maybeSingle();
    const lastCheckedAt = previous.data?.last_checked_at
      ? Date.parse(previous.data.last_checked_at)
      : 0;
    if (
      Number.isFinite(lastCheckedAt) &&
      now.getTime() - lastCheckedAt < REFRESH_THROTTLE_MS
    ) {
      return json(200, {
        ok: true,
        data: await readSnapshot(service),
        cached_refresh: true,
      });
    }

    const startedAt = Date.now();
    const [probe, costReport] = await Promise.all([
      callAnthropic({
        model: ANTHROPIC_DEFAULT_MODEL,
        system: "ping",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      }),
      fetchAnthropicCosts(config, now),
    ]);
    const latencyMs = Date.now() - startedAt;
    const providerOk = probe.ok;
    const providerErrorCode = probe.ok ? null : probe.code;
    const providerStatus = probe.ok ? 200 : probe.status;
    const metrics = aggregateAnthropicCosts(costReport.buckets, config, now);
    const status = resolveProviderHealthStatus({
      providerOk,
      providerErrorCode,
      adminApiConfigured: costReport.configured,
      adminApiOk: costReport.ok,
      metrics,
      config,
    });

    const previousFailures = Number(previous.data?.consecutive_failures ?? 0);
    const success = providerOk && (!costReport.configured || costReport.ok);
    const snapshot = {
      provider: PROVIDER,
      status,
      provider_ok: providerOk,
      admin_api_configured: costReport.configured,
      currency: metrics.currency,
      cost_today_usd: metrics.cost_today_usd,
      cost_7d_usd: metrics.cost_7d_usd,
      cost_30d_usd: metrics.cost_30d_usd,
      average_daily_cost_7d_usd: metrics.average_daily_cost_7d_usd,
      estimated_balance_usd: metrics.estimated_balance_usd,
      projected_days_remaining: metrics.projected_days_remaining,
      last_checked_at: now.toISOString(),
      last_success_at: success
        ? now.toISOString()
        : previous.data?.last_success_at ?? null,
      last_failure_at: success ? null : now.toISOString(),
      last_error_code: providerErrorCode ?? costReport.code,
      last_provider_status: providerStatus,
      consecutive_failures: success ? 0 : previousFailures + 1,
      latency_ms: latencyMs,
      data_source: costReport.ok ? "admin_cost_api" : "live_probe",
      details: {
        model: ANTHROPIC_DEFAULT_MODEL,
        cost_api_status: costReport.status,
        baseline_configured: config.baseline_credit_usd != null,
        balance_is_estimate: true,
      },
      updated_at: now.toISOString(),
    };
    const { error: persistError } = await service.from(
      "orbit_ai_provider_health",
    ).upsert(snapshot, { onConflict: "provider" });
    if (persistError) {
      throw new Error(
        `snapshot_persist_failed:${persistError.code ?? "unknown"}`,
      );
    }

    await updateAlerts(service, config, status, metrics, now);
    return json(200, { ok: true, data: await readSnapshot(service) });
  } catch (error) {
    console.error(
      "orbit-ai-provider-health",
      error instanceof Error ? error.message : "unknown_error",
    );
    return json(500, {
      ok: false,
      error: { code: "PROVIDER_HEALTH_REFRESH_FAILED" },
    });
  }
});
