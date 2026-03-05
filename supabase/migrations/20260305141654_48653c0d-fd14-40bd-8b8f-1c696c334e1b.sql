CREATE TABLE public.prospect_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  prospect_id uuid NOT NULL REFERENCES orbit_prospects(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL,
  titulo text,
  descricao text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospect_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_prospect_events_prospect ON prospect_events(prospect_id, created_at DESC);

CREATE POLICY "Users can view own empresa events" ON prospect_events FOR SELECT USING (empresa_id = get_user_empresa_id(auth.uid()));
CREATE POLICY "PE members can insert own empresa events" ON prospect_events FOR INSERT WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));
CREATE POLICY "Super admin full access prospect_events" ON prospect_events FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));