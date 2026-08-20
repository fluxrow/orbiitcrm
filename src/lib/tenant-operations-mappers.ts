import type {
  AgendaOpsRead,
  AiHandoffOpsRead,
  AlertsOpsRead,
  MediaOpsRead,
  QueueOpsRead,
  TenantOperationsDataMap,
  TenantOperationsSection,
  TenantOpsError,
  TenantOpsHealth,
  TenantOpsSummary,
  WhatsappOpsRead,
} from "@/lib/tenant-operations-types";

type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const boolean = (value: unknown, fallback = false) => typeof value === "boolean" ? value : fallback;
const string = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const nullableString = (value: unknown) => typeof value === "string" ? value : null;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function unwrap(payload: unknown): JsonObject {
  const envelope = object(payload);
  if (envelope.ok === false) {
    const failure = envelope as unknown as TenantOpsError;
    throw new Error(failure.error?.message || failure.error?.code || "Falha ao consultar o Centro de Operações.");
  }
  return object(envelope.ok === true && "data" in envelope ? envelope.data : payload);
}

function node(root: JsonObject, section: TenantOperationsSection): JsonObject {
  const nested = object(section === "queues" ? root.queue ?? root.queues : root[section]);
  return Object.keys(nested).length > 0 ? nested : root;
}

const mapAgenda = (root: JsonObject): AgendaOpsRead => {
  const raw = node(root, "agenda");
  const minNotice = raw.booking_min_notice_minutes ?? raw.min_notice_minutes;
  return {
    connected: boolean(raw.connected),
    google_account_masked: nullableString(raw.google_account_masked),
    calendar_id_masked: nullableString(raw.calendar_id_masked),
    timezone: string(raw.timezone, "America/Sao_Paulo"),
    availability: {
      start: string(object(raw.availability).start ?? raw.availability_start),
      end: string(object(raw.availability).end ?? raw.availability_end),
      break_start: nullableString(object(raw.availability).break_start ?? raw.break_start ?? raw.availability_break_start),
      break_end: nullableString(object(raw.availability).break_end ?? raw.break_end ?? raw.availability_break_end),
      break_semantics: "[start,end)",
    },
    meeting_duration_default_minutes: typeof raw.meeting_duration_default_minutes === "number" ? raw.meeting_duration_default_minutes : null,
    booking_min_notice_minutes: number(minNotice, number(raw.min_notice_hours) * 60),
    booking_max_horizon_days: number(raw.booking_max_horizon_days, number(raw.max_future_days)),
    diagnostics: {
      config_valid: boolean(object(raw.diagnostics).config_valid, boolean(raw.connected)),
      token_present: boolean(object(raw.diagnostics).token_present, boolean(raw.token_present)),
      token_expired_or_refresh_required: typeof object(raw.diagnostics).token_expired_or_refresh_required === "boolean"
        ? object(raw.diagnostics).token_expired_or_refresh_required as boolean
        : null,
      updated_at: nullableString(object(raw.diagnostics).updated_at ?? raw.updated_at),
    },
    exceptions: array(raw.exceptions).map((item) => {
      const exception = object(item);
      return {
        id: string(exception.id),
        exception_date: string(exception.exception_date),
        reason: string(exception.reason),
        is_available: boolean(exception.is_available),
        created_at: string(exception.created_at),
      };
    }),
  };
};

const mapAi = (root: JsonObject): AiHandoffOpsRead => {
  const raw = node(root, "ai_handoff");
  const counts = object(raw.counts);
  const value = (key: string, alias?: string) => number(counts[key] ?? raw[key] ?? (alias ? raw[alias] : undefined));
  return {
    automatic_mode_enabled: boolean(raw.automatic_mode_enabled, boolean(raw.modo_automatico)),
    automation_cutoff: nullableString(raw.automation_cutoff),
    counts: {
      ai_active: value("ai_active"),
      human_owned: value("human_owned", "human_takeover"),
      awaiting_human: value("awaiting_human"),
      handoff_sent: value("handoff_sent"),
      possibly_stuck: value("possibly_stuck"),
      pending_debounce: value("pending_debounce"),
    },
  };
};

const mapQueue = (root: JsonObject): QueueOpsRead => {
  const raw = node(root, "queues");
  const counts = object(raw.counts);
  const ages = object(raw.age_buckets);
  const locks = object(raw.locks);
  return {
    paused: boolean(raw.paused),
    adapter_enabled: boolean(raw.adapter_enabled),
    counts: {
      pending: number(counts.pending ?? raw.pending_count),
      processing: number(counts.processing ?? raw.processing_count),
      sent: number(counts.sent ?? raw.sent_count),
      failed: number(counts.failed ?? raw.failed_count),
      canceled: number(counts.canceled ?? raw.canceled_count),
      stale_canceled: number(counts.stale_canceled ?? raw.stale_canceled_count),
    },
    age_buckets: {
      under_1h: number(ages.under_1h ?? raw.under_1h),
      from_1h_to_24h: number(ages.from_1h_to_24h ?? raw.from_1h_to_24h),
      over_24h: number(ages.over_24h ?? raw.over_24h ?? raw.pending_over_24h),
    },
    locks: {
      active: number(locks.active ?? raw.active_locks),
      possibly_orphaned: number(locks.possibly_orphaned ?? raw.possibly_orphaned_locks),
    },
    stale_status_supported: boolean(raw.stale_status_supported, "stale_canceled_count" in raw),
  };
};

const mapWhatsapp = (root: JsonObject): WhatsappOpsRead => {
  const raw = node(root, "whatsapp");
  const credentials = object(raw.credentials);
  const heartbeat = object(raw.heartbeat);
  const canary = object(raw.canary);
  const policy = object(raw.sending_policy);
  const dailyLimit = policy.daily_limit ?? raw.daily_limit;
  const maxPerMinute = policy.max_per_minute ?? raw.max_per_minute;
  const active = boolean(raw.active, boolean(raw.ativo, boolean(raw.connected)));
  const offline = boolean(raw.instance_offline);
  return {
    configured: boolean(raw.configured, active || boolean(raw.token_present)),
    active,
    real_send_enabled: boolean(raw.real_send_enabled, boolean(raw.envio_real_liberado)),
    instance_offline: offline,
    status: raw.status === "online" || raw.status === "offline" || raw.status === "degraded" ? raw.status : offline ? "offline" : active ? "online" : "unknown",
    instance_id_masked: nullableString(raw.instance_id_masked),
    source_number_masked: nullableString(raw.source_number_masked),
    credentials: {
      instance_id_present: boolean(credentials.instance_id_present, boolean(raw.instance_id_present)),
      token_present: boolean(credentials.token_present, boolean(raw.token_present)),
      client_token_present: boolean(credentials.client_token_present, boolean(raw.client_token_present)),
      vault_backed: typeof credentials.vault_backed === "boolean" ? credentials.vault_backed : null,
      valid: boolean(credentials.valid, boolean(raw.credentials_valid)),
    },
    heartbeat: {
      last_check_at: nullableString(heartbeat.last_check_at ?? raw.last_check_at),
      last_online_at: nullableString(heartbeat.last_online_at ?? raw.last_online_at),
      offline_since: nullableString(heartbeat.offline_since ?? raw.offline_since),
      reason_code: nullableString(heartbeat.reason_code ?? raw.reason_code),
    },
    canary: {
      enabled: boolean(canary.enabled, boolean(raw.canary_enabled)),
      allowlisted_numbers_count: number(canary.allowlisted_numbers_count ?? raw.allowlisted_numbers_count),
    },
    sending_policy: {
      queue_enabled: boolean(policy.queue_enabled, boolean(raw.queue_enabled)),
      daily_limit: typeof dailyLimit === "number" ? dailyLimit : null,
      max_per_minute: typeof maxPerMinute === "number" ? maxPerMinute : null,
      warmup_enabled: boolean(policy.warmup_enabled, boolean(raw.warmup_enabled)),
      warmup_start_date: nullableString(policy.warmup_start_date ?? raw.warmup_start_date),
    },
  };
};

const mapMedia = (root: JsonObject): MediaOpsRead => {
  const raw = node(root, "media");
  const counts = object(raw.counts);
  const storage = object(raw.storage_health);
  return {
    total_storage_mb: number(raw.total_storage_mb),
    counts: {
      active: number(counts.active ?? raw.active_count ?? raw.media_count),
      processing: number(counts.processing ?? raw.processing_count),
      failed: number(counts.failed ?? raw.failed_count),
      soft_deleted: number(counts.soft_deleted ?? raw.soft_deleted_count),
      referenced_by_flows: number(counts.referenced_by_flows ?? raw.referenced_by_flows),
    },
    by_type: object(raw.by_type) as Record<string, number>,
    storage_health: {
      private_bucket_expected: boolean(storage.private_bucket_expected, boolean(raw.private_bucket_expected)),
      signed_url_enabled: boolean(storage.signed_url_enabled, boolean(raw.signed_url_enabled)),
      legacy_public_urls_detected: number(storage.legacy_public_urls_detected ?? raw.legacy_public_urls),
    },
    items: array(raw.items).map((item) => {
      const media = object(item);
      return {
        id: string(media.id),
        name: string(media.name),
        kind: string(media.kind),
        purpose: string(media.purpose),
        mime: nullableString(media.mime),
        size_bytes: number(media.size_bytes),
        active: boolean(media.active),
        approved: boolean(media.approved),
        deleted_at: nullableString(media.deleted_at),
        active_flow_references: number(media.active_flow_references),
        created_at: string(media.created_at),
      };
    }),
  };
};

const mapAlerts = (root: JsonObject): AlertsOpsRead => {
  const raw = node(root, "alerts");
  const counts = object(raw.counts);
  return {
    tenant_email_masked: nullableString(raw.tenant_email_masked),
    master_channel_configured: boolean(raw.master_channel_configured),
    counts: {
      critical: number(counts.critical ?? raw.critical_count),
      warning: number(counts.warning ?? raw.warning_count),
      informational: number(counts.informational ?? raw.informational_count),
      delivery_failed: number(counts.delivery_failed ?? raw.delivery_failed_count),
    },
  };
};

const mapSummary = (root: JsonObject): TenantOpsSummary => ({
  overall_status: root.overall_status === "healthy" || root.overall_status === "attention" || root.overall_status === "critical" ? root.overall_status : "unknown",
  feature_enabled: boolean(root.feature_enabled),
  modules: object(root.modules) as TenantOpsSummary["modules"],
  active_incidents: number(root.active_incidents),
  unresolved_alerts: number(root.unresolved_alerts),
  queue: { ...mapQueue(root).counts, over_24h: mapQueue(root).age_buckets.over_24h, oldest_pending_age_seconds: typeof object(root.queue).oldest_pending_age_seconds === "number" ? object(root.queue).oldest_pending_age_seconds as number : null },
  conversations: mapAi(root).counts,
});

const mapHealth = (root: JsonObject): TenantOpsHealth => ({
  status: root.overall_status === "healthy" || root.overall_status === "attention" || root.overall_status === "critical" ? root.overall_status : "unknown",
  api_available: true,
  database_available: true,
  feature_enabled: boolean(root.feature_enabled),
  supported_sections: ["summary", "agenda", "whatsapp", "ai_handoff", "queues", "media", "alerts", "audit", "capabilities", "health"],
  generated_at: string(root.generated_at, new Date().toISOString()),
});

export function mapTenantOperationsPayload<S extends TenantOperationsSection>(section: S, payload: unknown): TenantOperationsDataMap[S] {
  const root = unwrap(payload);
  const mapped: Partial<TenantOperationsDataMap> = {
    agenda: mapAgenda(root),
    whatsapp: mapWhatsapp(root),
    ai_handoff: mapAi(root),
    queues: mapQueue(root),
    media: mapMedia(root),
    alerts: mapAlerts(root),
    summary: mapSummary(root),
    health: mapHealth(root),
  };
  return (mapped[section] ?? root) as TenantOperationsDataMap[S];
}
