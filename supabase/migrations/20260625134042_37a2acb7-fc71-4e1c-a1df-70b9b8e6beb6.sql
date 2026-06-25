
-- Etapa 3 F3: Anti No-Show / Gatilhos por Data/Hora

-- 1. Estender enum de triggers
ALTER TYPE public.orbit_flow_trigger_type ADD VALUE IF NOT EXISTS 'meeting_reminder_24h';
ALTER TYPE public.orbit_flow_trigger_type ADD VALUE IF NOT EXISTS 'meeting_reminder_1h';

-- 2. Tabela orbit_meetings (1 Deal -> N reuniões)
CREATE TABLE IF NOT EXISTS public.orbit_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.orbit_deals(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES public.orbit_prospects(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.orbit_conversas(id) ON DELETE SET NULL,
  titulo text,
  descricao text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  meeting_url text,
  location text,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled, completed, no_show, canceled, rescheduled
  google_event_id text,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_meetings TO authenticated;
GRANT ALL ON public.orbit_meetings TO service_role;

ALTER TABLE public.orbit_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings tenant access" ON public.orbit_meetings
  FOR ALL TO authenticated
  USING (public.user_has_empresa_access(empresa_id))
  WITH CHECK (public.user_has_empresa_access(empresa_id));

CREATE INDEX IF NOT EXISTS idx_orbit_meetings_empresa ON public.orbit_meetings(empresa_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_orbit_meetings_deal ON public.orbit_meetings(deal_id);
CREATE INDEX IF NOT EXISTS idx_orbit_meetings_scheduler
  ON public.orbit_meetings(scheduled_at)
  WHERE status = 'scheduled';

CREATE TRIGGER trg_orbit_meetings_updated
  BEFORE UPDATE ON public.orbit_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
