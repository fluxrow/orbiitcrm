// Dreno idempotente de alertas operacionais pendentes.
//
// Reprocessa eventos de orbit_zapi_status_events com alert_sent=false
// (ex.: pendências antigas com alert_last_error='ops_alert_pending_*') e
// envia por E-MAIL. Nunca usa WhatsApp/Z-API de tenant e nunca reenvia um
// evento já marcado como enviado.

import { markOfflineAlertSent } from "./zapi-connection.ts";
import { sendOpsOfflineAlert } from "./zapi-ops-alert.ts";

export interface PendingAlertRow {
  id: string;
  empresa_id: string | null;
  zapi_config_id: string | null;
  instance_id: string | null;
  event_type: string;
  status_code: number | null;
  reason: string | null;
  created_at: string | null;
  alert_sent?: boolean | null;
  alert_last_error?: string | null;
}

/** Pendências elegíveis: nunca reprocessa evento já enviado. */
export function selectDrainable(rows: PendingAlertRow[] | null | undefined): PendingAlertRow[] {
  return (rows ?? []).filter((r) => r && r.alert_sent !== true);
}

export interface DrainOptions {
  empresaId?: string | null;
  limit?: number;
  dryRun?: boolean;
}

export interface DrainResultItem {
  event_id: string;
  empresa_id: string | null;
  sent: boolean;
  pending?: boolean;
  error?: string;
  channel?: string;
  provider_message_id?: string | null;
  idempotency_key?: string;
  dry_run?: boolean;
}

export async function drainPendingOpsAlerts(
  supabase: any,
  opts: DrainOptions = {},
): Promise<DrainResultItem[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
  let query = supabase
    .from("orbit_zapi_status_events")
    .select("id, empresa_id, zapi_config_id, instance_id, event_type, status_code, reason, created_at, alert_sent, alert_last_error")
    .eq("alert_sent", false)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (opts.empresaId) query = query.eq("empresa_id", opts.empresaId);

  const { data } = await query;
  const rows = selectDrainable(data as PendingAlertRow[] | null);
  const out: DrainResultItem[] = [];

  for (const row of rows) {
    if (opts.dryRun) {
      out.push({ event_id: row.id, empresa_id: row.empresa_id, sent: false, dry_run: true });
      continue;
    }
    const alert = await sendOpsOfflineAlert(supabase, {
      empresa_id: row.empresa_id,
      instance_id: row.instance_id,
      reason: row.reason || row.event_type,
      event_type: row.event_type,
      status_code: row.status_code,
      event_id: row.id,
      occurred_at: row.created_at,
    });
    await markOfflineAlertSent(supabase, {
      config_id: alert.sent ? row.zapi_config_id : null,
      event_id: row.id,
      error: alert.sent ? null : alert.error ?? "alert_failed",
      channel: alert.channel,
      provider_message_id: alert.provider_message_id ?? null,
      idempotency_key: alert.idempotency_key,
    });
    out.push({
      event_id: row.id,
      empresa_id: row.empresa_id,
      sent: alert.sent,
      pending: alert.pending,
      error: alert.error,
      channel: alert.channel,
      provider_message_id: alert.provider_message_id ?? null,
      idempotency_key: alert.idempotency_key,
    });
  }
  return out;
}
