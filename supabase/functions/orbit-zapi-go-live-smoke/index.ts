// orbit-zapi-go-live-smoke
// Smoke runner de go-live Z-API. Somente super_admin.
// NUNCA envia mensagem real. NUNCA altera envio_real_liberado.
// NUNCA cria campanha ou destinatário.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";
import { auditZapiSendAttempt } from "../_shared/zapi-audit.ts";

interface Check {
  name: string;
  status: "pass" | "fail" | "warn";
  details?: Record<string, unknown>;
  message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);
    }

    const userId = userData.user.id;
    const { data: superRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!superRow) {
      return fail(ErrorCodes.UNAUTHORIZED, "Apenas super_admin pode executar o smoke", 403, undefined, req);
    }

    const body = await req.json().catch(() => ({}));
    const empresa_id: string | undefined = body?.empresa_id;
    const mode: string = body?.mode ?? "safe";
    if (!empresa_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id é obrigatório", 400, undefined, req);
    }
    if (mode !== "safe") {
      return fail(ErrorCodes.VALIDATION_ERROR, "Somente mode=safe é suportado", 400, undefined, req);
    }

    const checks: Check[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Z-API config
    const zapi = await getOrbitZapiRuntimeConfig(supabase, empresa_id);
    if (!zapi) {
      checks.push({ name: "zapi_config_exists", status: "fail", message: "orbit_zapi_config ausente" });
      blockers.push("Z-API não configurada para esta empresa.");
    } else {
      checks.push({
        name: "zapi_config_exists",
        status: "pass",
        details: {
          zapi_config_id: zapi.id,
          instance_id_present: !!zapi.instance_id,
          token_present: !!zapi.token,
          client_token_present: !!zapi.client_token,
          envio_real_liberado: zapi.envio_real_liberado === true,
        },
      });

      if (!zapi.instance_id || !zapi.token || !zapi.client_token) {
        blockers.push("Instância Z-API incompleta (instance_id, token ou client_token).");
        checks.push({ name: "zapi_credentials_complete", status: "fail" });
      } else {
        checks.push({ name: "zapi_credentials_complete", status: "pass" });
      }
    }

    // 2. Ritmo
    const { data: rhythm } = await supabase
      .from("orbit_whatsapp_sending_config")
      .select("enabled, daily_limit, max_per_minute, warmup_enabled, warmup_start_date, min_delay_ms, max_delay_ms")
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    if (!rhythm) {
      blockers.push("orbit_whatsapp_sending_config ausente.");
      checks.push({ name: "rhythm_config", status: "fail" });
    } else {
      const maxPerMinute = Number(rhythm.max_per_minute) || 0;
      const dailyLimit = Number(rhythm.daily_limit) || 0;
      const perMinuteMinDelayMs = maxPerMinute > 0 ? Math.ceil(60_000 / maxPerMinute) : null;

      const details = {
        enabled: rhythm.enabled === true,
        daily_limit: dailyLimit,
        max_per_minute: maxPerMinute,
        warmup_enabled: rhythm.warmup_enabled === true,
        warmup_start_date: rhythm.warmup_start_date ?? null,
        per_minute_min_delay_ms: perMinuteMinDelayMs,
      };

      const rhythmIssues: string[] = [];
      if (!rhythm.enabled) rhythmIssues.push("ritmo desativado");
      if (dailyLimit <= 0) rhythmIssues.push("daily_limit inválido");
      if (dailyLimit > 80) warnings.push(`daily_limit=${dailyLimit} acima do sugerido para go-live (80).`);
      if (maxPerMinute <= 0) rhythmIssues.push("max_per_minute inválido");
      if (maxPerMinute > 3) warnings.push(`max_per_minute=${maxPerMinute} acima do sugerido (3).`);

      checks.push({
        name: "rhythm_config",
        status: rhythmIssues.length === 0 ? "pass" : "fail",
        details,
        message: rhythmIssues.join("; ") || undefined,
      });
      if (rhythmIssues.length) blockers.push(`Controle de ritmo: ${rhythmIssues.join(", ")}`);
    }

    // 3. Trava manual de envio real
    const blockReason = getOrbitZapiRealSendBlockReason(zapi);
    if (blockReason) {
      checks.push({ name: "real_send_blocked", status: "pass", message: blockReason });
    } else {
      checks.push({ name: "real_send_blocked", status: "warn", message: "envio_real_liberado=true — envio real habilitado." });
      warnings.push("Envio real Z-API está LIBERADO para esta empresa.");
    }

    // 4. Usage do dia
    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await supabase
      .from("orbit_whatsapp_daily_usage")
      .select("sent_count")
      .eq("empresa_id", empresa_id)
      .eq("date", today)
      .maybeSingle();
    checks.push({
      name: "daily_usage_snapshot",
      status: "pass",
      details: { date: today, sent_count: Number(usageRow?.sent_count ?? 0) },
    });

    // 5. Scheduler cron
    const { data: cronRow } = await supabase.rpc("check_cron_job_exists", { job_name: "orbit-campaign-scheduler-tick" }).maybeSingle?.() ?? { data: null };
    // Fallback via query direta
    let cronExists = cronRow === true;
    try {
      const { data: r } = await supabase.from("cron.job").select("jobname").eq("jobname", "orbit-campaign-scheduler-tick").maybeSingle();
      cronExists = !!r || cronExists;
    } catch {
      // Sem acesso direto a cron.job — deixamos como está.
    }
    checks.push({
      name: "campaign_scheduler_cron",
      status: cronExists ? "pass" : "warn",
      details: { job: "orbit-campaign-scheduler-tick" },
      message: cronExists ? undefined : "cron.job não pôde ser lido diretamente; confirme via banco.",
    });
    if (!cronExists) warnings.push("cron do orbit-campaign-scheduler-tick não confirmado.");

    // 6. Último bloqueio auditado
    const { data: lastBlock } = await supabase
      .from("orbit_zapi_send_audit")
      .select("id, function_name, block_reason, created_at")
      .eq("empresa_id", empresa_id)
      .eq("blocked", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    checks.push({
      name: "last_blocked_audit",
      status: "pass",
      details: lastBlock ? {
        id: lastBlock.id,
        function_name: lastBlock.function_name,
        block_reason: lastBlock.block_reason,
        created_at: lastBlock.created_at,
      } : { present: false },
    });

    // 7. Audit smoke insert (auditoria de bloqueio fake)
    await auditZapiSendAttempt(supabase, {
      empresa_id,
      function_name: "orbit-zapi-go-live-smoke",
      action: "smoke_check",
      blocked: true,
      block_reason: "SMOKE_TEST_FAKE_BLOCK",
      zapi_config_id: zapi?.id ?? null,
      created_by: userId,
      payload_summary: { mode, executed_at: new Date().toISOString() },
    });
    checks.push({ name: "audit_write", status: "pass" });

    const criticalFail = checks.some((c) => c.status === "fail");
    const ready_for_real_send = !criticalFail && zapi?.envio_real_liberado === true;

    return ok(
      { empresa_id, ready_for_real_send, checks, blockers, warnings },
      undefined,
      req,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-zapi-go-live-smoke] erro:", message);
    return fail(ErrorCodes.INTERNAL_ERROR, message, 500, undefined, req);
  }
});
