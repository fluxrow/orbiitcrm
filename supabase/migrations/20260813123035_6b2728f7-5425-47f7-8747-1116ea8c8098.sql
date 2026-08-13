ALTER TABLE public.orbit_zapi_status_events
  ADD COLUMN IF NOT EXISTS alert_channel TEXT,
  ADD COLUMN IF NOT EXISTS alert_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alert_provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS alert_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orbit_zapi_status_events_alert_idem_key
  ON public.orbit_zapi_status_events (alert_idempotency_key)
  WHERE alert_idempotency_key IS NOT NULL;