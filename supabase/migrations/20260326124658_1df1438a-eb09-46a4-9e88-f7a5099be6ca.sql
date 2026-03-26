
-- Table: orbit_email_events
CREATE TABLE public.orbit_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.orbit_campaign_recipients(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.orbit_empresas(id),
  resend_email_id text,
  event_type text NOT NULL,
  url text,
  user_agent text,
  ip_address text,
  raw_payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_email_events_recipient ON public.orbit_email_events(recipient_id);
CREATE INDEX idx_email_events_empresa_type ON public.orbit_email_events(empresa_id, event_type);

-- New columns on orbit_campaign_recipients
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN IF NOT EXISTS resend_email_id text;
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN IF NOT EXISTS complained_at timestamptz;
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN IF NOT EXISTS engagement_status text DEFAULT 'pending';

-- RLS for orbit_email_events
ALTER TABLE public.orbit_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view email events for their empresa"
  ON public.orbit_email_events FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
