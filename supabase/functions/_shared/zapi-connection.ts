// Fonte ÚNICA do estado de conexão da instância Z-API por tenant.
//
// REGRAS INVIOLÁVEIS
//  1. FAIL-CLOSED: instância marcada como offline, ou com send_block_until no
//     futuro, NUNCA envia mensagem real. Nenhum caminho pode ignorar
//     `zapiInstanceBlockReason()`.
//  2. Isolamento multi-tenant: todo update é filtrado por empresa_id/config id.
//  3. Nenhum segredo (token/client_token) entra em log, evento ou alerta.
//  4. Alertas têm cooldown para evitar tempestade (uma mensagem por janela).

export const ZAPI_OFFLINE_REASON = "ZAPI_INSTANCE_OFFLINE";
export const ZAPI_SEND_BLOCK_REASON = "ZAPI_SEND_TEMPORARILY_BLOCKED";

/** Marcador de versão do stack Z-API (conexão/mídia/alerta). */
export const ZAPI_STACK_VERSION = "zapi-stack-2026-08-13-ops-sender-guard";

/** Cooldown do alerta operacional por instância (minutos). */
export const OFFLINE_ALERT_COOLDOWN_MINUTES = 60;

/** Bloqueio padrão quando a Z-API sinaliza block/ban temporário (24h). */
export const ZAPI_BLOCK_24H_SECONDS = 24 * 60 * 60;

export interface ZapiConnectionState {
  id?: string | null;
  empresa_id?: string | null;
  instance_id?: string | null;
  instance_offline?: boolean | null;
  send_block_until?: string | null;
  offline_reason?: string | null;
}

/**
 * Motivo de bloqueio por estado de conexão, ou null quando pode enviar.
 * PURO — usado tanto no pré-claim quanto no re-check pós-claim do worker.
 */
export function zapiInstanceBlockReason(
  state: ZapiConnectionState | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!state) return ZAPI_OFFLINE_REASON;
  if (state.instance_offline === true) return ZAPI_OFFLINE_REASON;
  const until = state.send_block_until ? Date.parse(state.send_block_until) : NaN;
  if (Number.isFinite(until) && until > now.getTime()) return ZAPI_SEND_BLOCK_REASON;
  return null;
}

export interface ZapiFailureClassification {
  /** Deve marcar a instância como offline (fail-closed). */
  offline: boolean;
  /** Segundos de bloqueio temporal adicional (ex.: block 24h). */
  blockSeconds: number | null;
  reason: string;
  event_type: string;
}

/** Normaliza texto de erro removendo qualquer coisa parecida com token. */
export function sanitizeZapiReason(input: unknown, maxLen = 300): string {
  let text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  text = text
    .replace(/\/token\/[A-Za-z0-9]+/gi, "/token/***")
    .replace(/"(client-token|client_token|token|apikey|authorization)"\s*:\s*"[^"]*"/gi, '"$1":"***"')
    .replace(/[A-Fa-f0-9]{24,}/g, "***");
  return text.slice(0, maxLen);
}

const SESSION_DISCONNECT_RE =
  /(session[-\s_]?disconnect|not possible to restore a session|please login again|phone[-\s_]?disconnect|disconnected|not connected|smartphone.*disconnect|instance not found|instance is not paid|deleted)/i;

const TEMP_BLOCK_RE = /(block|banned|ban\b|temporarily blocked|24h|too many requests)/i;

/**
 * Classifica uma falha de chamada Z-API (HTTP status + corpo) em estado de
 * conexão. 401/403 e mensagens de sessão perdida SEMPRE derrubam a instância.
 */
export function classifyZapiFailure(status: number | null, body: unknown): ZapiFailureClassification {
  const reason = sanitizeZapiReason(body);

  if (status === 401 || status === 403) {
    return {
      offline: true,
      blockSeconds: null,
      reason: `zapi_unauthorized_${status}: ${reason}`,
      event_type: "unauthorized",
    };
  }

  if (status === 429 || TEMP_BLOCK_RE.test(reason)) {
    return {
      offline: false,
      blockSeconds: ZAPI_BLOCK_24H_SECONDS,
      reason: `zapi_temporarily_blocked: ${reason}`,
      event_type: "temporarily-blocked",
    };
  }

  if (SESSION_DISCONNECT_RE.test(reason)) {
    return {
      offline: true,
      blockSeconds: null,
      reason: `zapi_session_disconnected: ${reason}`,
      event_type: "session-disconnected",
    };
  }

  return { offline: false, blockSeconds: null, reason, event_type: "send-error" };
}

/** Deve enviar alerta agora? Cooldown por instância evita tempestade. */
export function shouldSendOfflineAlert(
  lastAlertAt: string | null | undefined,
  now: Date = new Date(),
  cooldownMinutes = OFFLINE_ALERT_COOLDOWN_MINUTES,
): boolean {
  if (!lastAlertAt) return true;
  const ts = Date.parse(lastAlertAt);
  if (!Number.isFinite(ts)) return true;
  return now.getTime() - ts >= cooldownMinutes * 60_000;
}

/** Lê o estado de conexão fresco (sem cache) para o gate atômico. */
export async function fetchZapiConnectionState(
  supabase: any,
  empresaId: string,
): Promise<ZapiConnectionState | null> {
  const { data } = await supabase
    .from("orbit_zapi_config")
    .select("id, empresa_id, instance_id, instance_offline, send_block_until, offline_reason")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .maybeSingle();
  return (data as ZapiConnectionState | null) ?? null;
}

async function logStatusEvent(
  supabase: any,
  input: {
    empresa_id?: string | null;
    zapi_config_id?: string | null;
    instance_id?: string | null;
    event_type: string;
    source: string;
    status_code?: number | null;
    reason?: string | null;
    alert_sent?: boolean;
  },
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("orbit_zapi_status_events")
      .insert({
        empresa_id: input.empresa_id ?? null,
        zapi_config_id: input.zapi_config_id ?? null,
        instance_id: input.instance_id ?? null,
        event_type: input.event_type,
        source: input.source,
        status_code: input.status_code ?? null,
        reason: input.reason ? sanitizeZapiReason(input.reason) : null,
        alert_sent: input.alert_sent ?? false,
      })
      .select("id")
      .maybeSingle();
    return (data as any)?.id ?? null;
  } catch (e) {
    console.warn("[zapi-connection] logStatusEvent falhou", (e as any)?.message);
    return null;
  }
}

export interface MarkOfflineInput {
  empresa_id?: string | null;
  zapi_config_id?: string | null;
  instance_id?: string | null;
  reason: string;
  source: "webhook" | "heartbeat" | "send" | "manual";
  event_type?: string;
  status_code?: number | null;
  blockSeconds?: number | null;
  /** Quando false, apenas registra o bloqueio temporal (sem derrubar a instância). */
  offline?: boolean;
}

export interface MarkOfflineResult {
  config_id: string | null;
  empresa_id: string | null;
  instance_id: string | null;
  event_id: string | null;
  changed: boolean;
  shouldAlert: boolean;
  paused_outbox: number;
}

/**
 * Marca a instância como offline/bloqueada, registra evento e pausa a fila do
 * tenant. Idempotente: reentradas não reescrevem offline_since nem reduzem
 * send_block_until.
 */
export async function markZapiInstanceOffline(
  supabase: any,
  input: MarkOfflineInput,
): Promise<MarkOfflineResult> {
  const nowIso = new Date().toISOString();
  const reason = sanitizeZapiReason(input.reason);

  let query = supabase
    .from("orbit_zapi_config")
    .select("id, empresa_id, instance_id, instance_offline, offline_since, send_block_until, offline_alert_sent_at")
    .eq("ativo", true);

  if (input.zapi_config_id) query = query.eq("id", input.zapi_config_id);
  else if (input.empresa_id) query = query.eq("empresa_id", input.empresa_id);
  else if (input.instance_id) query = query.eq("instance_id", input.instance_id);

  const { data: cfg } = await query.maybeSingle();

  const empresaId = (cfg as any)?.empresa_id ?? input.empresa_id ?? null;
  const instanceId = (cfg as any)?.instance_id ?? input.instance_id ?? null;
  const goOffline = input.offline !== false;

  let blockUntilIso: string | null = (cfg as any)?.send_block_until ?? null;
  if (input.blockSeconds && input.blockSeconds > 0) {
    const candidate = new Date(Date.now() + input.blockSeconds * 1000).toISOString();
    if (!blockUntilIso || Date.parse(candidate) > Date.parse(blockUntilIso)) blockUntilIso = candidate;
  }

  let changed = false;
  if (cfg?.id) {
    const patch: Record<string, unknown> = {
      offline_reason: reason,
      last_status_check_at: nowIso,
      send_block_until: blockUntilIso,
    };
    if (goOffline) {
      patch.instance_offline = true;
      patch.offline_since = (cfg as any).offline_since ?? nowIso;
    }
    const { error } = await supabase.from("orbit_zapi_config").update(patch).eq("id", cfg.id);
    if (error) console.warn("[zapi-connection] update offline falhou", error.message);
    else changed = goOffline ? (cfg as any).instance_offline !== true : true;
  }

  const shouldAlert =
    (goOffline || !!input.blockSeconds) &&
    shouldSendOfflineAlert((cfg as any)?.offline_alert_sent_at ?? null);

  const eventId = await logStatusEvent(supabase, {
    empresa_id: empresaId,
    zapi_config_id: cfg?.id ?? input.zapi_config_id ?? null,
    instance_id: instanceId,
    event_type: input.event_type ?? (goOffline ? "offline" : "blocked"),
    source: input.source,
    status_code: input.status_code ?? null,
    reason,
  });

  // Pausa (NUNCA falha) os pendentes do tenant enquanto offline.
  let paused = 0;
  if (empresaId && goOffline) {
    paused = await pauseTenantOutbox(supabase, empresaId, ZAPI_OFFLINE_REASON);
  }

  return {
    config_id: cfg?.id ?? null,
    empresa_id: empresaId,
    instance_id: instanceId,
    event_id: eventId,
    changed,
    shouldAlert,
    paused_outbox: paused,
  };
}

/**
 * Empurra os pendentes do tenant para a próxima janela. Nunca marca falha —
 * a fila é retomada automaticamente quando a instância voltar.
 */
export async function pauseTenantOutbox(
  supabase: any,
  empresaId: string,
  reason: string,
  minutes = 5,
): Promise<number> {
  try {
    const nowIso = new Date().toISOString();
    const retryIso = new Date(Date.now() + minutes * 60_000).toISOString();
    const { data } = await supabase
      .from("orbit_whatsapp_outbox")
      .update({ next_attempt_at: retryIso, last_error: reason, locked_at: null, locked_by: null })
      .eq("empresa_id", empresaId)
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .select("id");
    return (data as any[] | null)?.length ?? 0;
  } catch (e) {
    console.warn("[zapi-connection] pauseTenantOutbox falhou", (e as any)?.message);
    return 0;
  }
}

/** Limpa o estado offline após reconexão confirmada. */
export async function markZapiInstanceOnline(
  supabase: any,
  input: { empresa_id?: string | null; instance_id?: string | null; source: "webhook" | "heartbeat" | "manual" },
): Promise<{ config_id: string | null; recovered: boolean }> {
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("orbit_zapi_config")
    .select("id, empresa_id, instance_id, instance_offline")
    .eq("ativo", true);
  if (input.empresa_id) query = query.eq("empresa_id", input.empresa_id);
  else if (input.instance_id) query = query.eq("instance_id", input.instance_id);
  const { data: cfg } = await query.maybeSingle();
  if (!cfg?.id) return { config_id: null, recovered: false };

  const recovered = (cfg as any).instance_offline === true;
  await supabase
    .from("orbit_zapi_config")
    .update({
      instance_offline: false,
      offline_since: null,
      offline_reason: null,
      last_online_at: nowIso,
      last_status_check_at: nowIso,
      offline_alert_sent_at: null,
    })
    .eq("id", cfg.id);

  if (recovered) {
    await logStatusEvent(supabase, {
      empresa_id: (cfg as any).empresa_id,
      zapi_config_id: cfg.id,
      instance_id: (cfg as any).instance_id,
      event_type: "online",
      source: input.source,
      reason: "reconectado",
    });
  }
  return { config_id: cfg.id, recovered };
}

/**
 * Registra o resultado do alerta (cooldown + auditoria).
 * Quando falha/pendente, o cooldown NÃO é gravado — o próximo ciclo tenta de
 * novo e `alert_attempts` acumula para auditoria do retry.
 */
export async function markOfflineAlertSent(
  supabase: any,
  input: {
    config_id: string | null;
    event_id: string | null;
    error?: string | null;
    channel?: string | null;
    provider_message_id?: string | null;
    idempotency_key?: string | null;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  if (input.config_id && !input.error) {
    await supabase.from("orbit_zapi_config").update({ offline_alert_sent_at: nowIso }).eq("id", input.config_id);
  }
  if (input.event_id) {
    let attempts = 1;
    try {
      const { data } = await supabase
        .from("orbit_zapi_status_events")
        .select("alert_attempts")
        .eq("id", input.event_id)
        .maybeSingle();
      attempts = Number((data as any)?.alert_attempts ?? 0) + 1;
    } catch (_e) {
      attempts = 1;
    }
    const sent = !input.error;
    await supabase
      .from("orbit_zapi_status_events")
      .update({
        alert_sent: sent,
        alert_attempts: attempts,
        alert_last_error: input.error ? sanitizeZapiReason(input.error) : null,
        alert_channel: input.channel ?? null,
        alert_sent_at: sent ? nowIso : null,
        alert_provider_message_id: sent ? (input.provider_message_id ?? null) : null,
        alert_idempotency_key: input.idempotency_key ?? null,
      })
      .eq("id", input.event_id);
  }
}

