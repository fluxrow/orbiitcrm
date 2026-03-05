CREATE TABLE IF NOT EXISTS public.orbit_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  instance_id text,
  phone text,
  payload jsonb,
  status text DEFAULT 'received',
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.orbit_webhook_logs ENABLE ROW LEVEL SECURITY;