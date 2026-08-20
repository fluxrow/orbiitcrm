export const TENANT_OPERATIONS_FEATURE_FLAG = "tenant_operations_center_v1" as const;

export type TenantOperationsSection =
  | "summary"
  | "agenda"
  | "whatsapp"
  | "ai_handoff"
  | "queues"
  | "media"
  | "prompts_flows"
  | "alerts"
  | "audit"
  | "capabilities"
  | "health";

export type DataFreshness = "realtime" | "near_realtime" | "snapshot";
export type OpsStatus = "healthy" | "attention" | "critical" | "unknown";

export interface OpsWarning {
  code: string;
  message: string;
  module?: TenantOperationsSection;
}

export interface TenantOpsMeta {
  tenant_id: string;
  generated_at: string;
  data_freshness: DataFreshness;
  request_id: string;
  masked: boolean;
  partial: boolean;
  warnings: OpsWarning[];
  source_commit?: string;
  schema_version?: string;
}

export interface TenantOpsResponse<T> {
  ok: true;
  data: T;
  meta: TenantOpsMeta;
}

export type TenantOpsErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "TENANT_CONTEXT_MISSING"
  | "FEATURE_DISABLED"
  | "IMPERSONATION_EXPIRED"
  | "INVALID_QUERY"
  | "RATE_LIMITED"
  | "DATA_SOURCE_UNAVAILABLE"
  | "PARTIAL_DATA"
  | "INTERNAL_ERROR";

export interface TenantOpsError {
  ok: false;
  error: {
    code: TenantOpsErrorCode;
    message: string;
    request_id: string;
    retryable: boolean;
  };
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface ModuleStatus {
  status: OpsStatus;
  severity: "info" | "warning" | "critical";
  message: string;
  checked_at: string;
}

export interface TenantOpsSummary {
  overall_status: OpsStatus;
  feature_enabled: boolean;
  modules: Record<"agenda" | "whatsapp" | "ai_handoff" | "queues" | "media" | "alerts", ModuleStatus>;
  active_incidents: number;
  unresolved_alerts: number;
  queue: {
    pending: number;
    processing: number;
    failed: number;
    stale_canceled: number;
    over_24h: number;
    oldest_pending_age_seconds: number | null;
  };
  conversations: {
    awaiting_human: number;
    human_owned: number;
    ai_active: number;
    possibly_stuck: number;
  };
}

export interface AgendaOpsRead {
  connected: boolean;
  google_account_masked: string | null;
  calendar_id_masked: string | null;
  timezone: string;
  availability: {
    start: string;
    end: string;
    break_start: string | null;
    break_end: string | null;
    break_semantics: "[start,end)";
  };
  meeting_duration_default_minutes: number | null;
  booking_min_notice_minutes: number;
  booking_max_horizon_days: number;
  diagnostics: {
    config_valid: boolean;
    token_present: boolean;
    token_expired_or_refresh_required: boolean | null;
    updated_at: string | null;
  };
  exceptions: Array<{
    id: string;
    exception_date: string;
    reason: string;
    is_available: boolean;
    created_at: string;
  }>;
}

export interface WhatsappOpsRead {
  configured: boolean;
  active: boolean;
  real_send_enabled: boolean;
  instance_offline: boolean;
  status: "online" | "offline" | "degraded" | "unknown";
  instance_id_masked: string | null;
  source_number_masked: string | null;
  credentials: {
    instance_id_present: boolean;
    token_present: boolean;
    client_token_present: boolean;
    vault_backed: boolean | null;
    valid: boolean;
  };
  heartbeat: {
    last_check_at: string | null;
    last_online_at: string | null;
    offline_since: string | null;
    reason_code: string | null;
  };
  canary: { enabled: boolean; allowlisted_numbers_count: number };
  sending_policy: {
    queue_enabled: boolean;
    daily_limit: number | null;
    max_per_minute: number | null;
    warmup_enabled: boolean;
    warmup_start_date: string | null;
  };
}

export interface AiHandoffOpsRead {
  automatic_mode_enabled: boolean;
  automation_cutoff: string | null;
  counts: {
    ai_active: number;
    human_owned: number;
    awaiting_human: number;
    handoff_sent: number;
    possibly_stuck: number;
    pending_debounce: number;
  };
}

export interface QueueOpsRead {
  paused: boolean;
  adapter_enabled: boolean;
  counts: Record<"pending" | "processing" | "sent" | "failed" | "canceled" | "stale_canceled", number>;
  age_buckets: { under_1h: number; from_1h_to_24h: number; over_24h: number };
  locks: { active: number; possibly_orphaned: number };
  stale_status_supported: boolean;
}

export interface MediaOpsRead {
  total_storage_mb: number;
  counts: { active: number; processing: number; failed: number; soft_deleted: number; referenced_by_flows: number };
  by_type: Record<string, number>;
  storage_health: {
    private_bucket_expected: boolean;
    signed_url_enabled: boolean;
    legacy_public_urls_detected: number;
  };
  items: Array<{
    id: string;
    name: string;
    kind: string;
    purpose: string;
    mime: string | null;
    size_bytes: number;
    active: boolean;
    approved: boolean;
    deleted_at: string | null;
    active_flow_references: number;
    created_at: string;
  }>;
}

export interface ContentVersionRead {
  id: string;
  version_number: number;
  is_active: boolean;
  changelog: string;
  published_at: string;
  published_by: string | null;
  author_name: string | null;
}

export interface PromptsFlowsOpsRead {
  prompts: Array<{
    id: string;
    name: string;
    description: string | null;
    runtime_slot: "prompt_identidade" | "prompt_roteiro" | "prompt_regras";
    draft_content: string;
    draft_description: string | null;
    status: "published" | "draft";
    active_version_id: string | null;
    active_version_number: number | null;
    versions: ContentVersionRead[];
  }>;
  flows: Array<{
    id: string;
    name: string;
    status: "published" | "draft";
    active: boolean;
    nodes_schema: Record<string, unknown>;
    edges_schema: unknown[];
    active_version_id: string | null;
    active_version_number: number | null;
    versions: ContentVersionRead[];
  }>;
}

export interface AlertsOpsRead {
  tenant_email_masked: string | null;
  master_channel_configured: boolean;
  counts: { critical: number; warning: number; informational: number; delivery_failed: number };
}

export interface TenantAuditRead {
  retention_days: 365;
  coverage: "complete" | "partial" | "unknown";
  items: CursorPage<{
    id: string;
    occurred_at: string;
    actor_type: "user" | "support_jit" | "system";
    actor_display_name: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    result: "success" | "denied" | "failed";
    reason: string | null;
  }>;
}

export interface TenantOpsCapabilities {
  role: "super_admin" | "admin" | "vendedor" | "viewer" | "support";
  impersonation: { active: boolean; expires_at: string | null; session_id: string | null };
  modules: Record<TenantOperationsSection, {
    view: boolean;
    view_sensitive_masked: boolean;
    test: boolean;
    edit: boolean;
    activate: boolean;
    pause: boolean;
    resume: boolean;
    cancel: boolean;
    reprocess: boolean;
    publish: boolean;
    rollback: boolean;
  }>;
}

export interface TenantOpsHealth {
  status: OpsStatus;
  api_available: boolean;
  database_available: boolean;
  feature_enabled: boolean;
  supported_sections: TenantOperationsSection[];
  generated_at: string;
}

export type TenantOperationsDataMap = {
  summary: TenantOpsSummary;
  agenda: AgendaOpsRead;
  whatsapp: WhatsappOpsRead;
  ai_handoff: AiHandoffOpsRead;
  queues: QueueOpsRead;
  media: MediaOpsRead;
  prompts_flows: PromptsFlowsOpsRead;
  alerts: AlertsOpsRead;
  audit: TenantAuditRead;
  capabilities: TenantOpsCapabilities;
  health: TenantOpsHealth;
};
