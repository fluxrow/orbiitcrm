
-- ========== ENUMs ==========
DO $$ BEGIN
  CREATE TYPE public.orbit_flow_trigger_type AS ENUM (
    'prospect_qualified',
    'deal_stage_changed',
    'deal_idle',
    'conversa_no_reply'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.orbit_flow_action_type AS ENUM (
    'send_whatsapp_template',
    'move_deal_stage',
    'create_task',
    'toggle_ai_agent',
    'notify_vendedor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.orbit_flow_run_status AS ENUM (
    'pending','running','success','error','skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== Helper: empresa membership check ==========
CREATE OR REPLACE FUNCTION public.user_has_empresa_access(_empresa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND empresa_id = _empresa_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_empresa_memberships
    WHERE user_id = auth.uid() AND empresa_id = _empresa_id
  );
$$;

-- ========== updated_at trigger fn (reuse if exists) ==========
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ========== orbit_flow_templates ==========
CREATE TABLE IF NOT EXISTS public.orbit_flow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  categoria text,
  definicao jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_global boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_flow_templates TO authenticated;
GRANT ALL ON public.orbit_flow_templates TO service_role;
ALTER TABLE public.orbit_flow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates visible to authenticated"
  ON public.orbit_flow_templates FOR SELECT TO authenticated
  USING (is_global = true);

DROP TRIGGER IF EXISTS trg_orbit_flow_templates_updated ON public.orbit_flow_templates;
CREATE TRIGGER trg_orbit_flow_templates_updated
  BEFORE UPDATE ON public.orbit_flow_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== orbit_flows ==========
CREATE TABLE IF NOT EXISTS public.orbit_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.orbit_flow_templates(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  trigger_type public.orbit_flow_trigger_type NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  condicoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT false,
  created_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orbit_flows_empresa_ativo
  ON public.orbit_flows(empresa_id, trigger_type) WHERE ativo = true AND deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_flows TO authenticated;
GRANT ALL ON public.orbit_flows TO service_role;
ALTER TABLE public.orbit_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flows tenant access"
  ON public.orbit_flows FOR ALL TO authenticated
  USING (public.user_has_empresa_access(empresa_id))
  WITH CHECK (public.user_has_empresa_access(empresa_id));

DROP TRIGGER IF EXISTS trg_orbit_flows_updated ON public.orbit_flows;
CREATE TRIGGER trg_orbit_flows_updated
  BEFORE UPDATE ON public.orbit_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== orbit_flow_actions ==========
CREATE TABLE IF NOT EXISTS public.orbit_flow_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.orbit_flows(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  action_type public.orbit_flow_action_type NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  delay_seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orbit_flow_actions_flow ON public.orbit_flow_actions(flow_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_flow_actions TO authenticated;
GRANT ALL ON public.orbit_flow_actions TO service_role;
ALTER TABLE public.orbit_flow_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_actions tenant access"
  ON public.orbit_flow_actions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orbit_flows f WHERE f.id = flow_id AND public.user_has_empresa_access(f.empresa_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orbit_flows f WHERE f.id = flow_id AND public.user_has_empresa_access(f.empresa_id)));

DROP TRIGGER IF EXISTS trg_orbit_flow_actions_updated ON public.orbit_flow_actions;
CREATE TRIGGER trg_orbit_flow_actions_updated
  BEFORE UPDATE ON public.orbit_flow_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== orbit_flow_events (queue) ==========
CREATE TABLE IF NOT EXISTS public.orbit_flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  event_type public.orbit_flow_trigger_type NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orbit_flow_events_pending
  ON public.orbit_flow_events(created_at) WHERE processed = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orbit_flow_events_dedupe
  ON public.orbit_flow_events(empresa_id, event_type, dedupe_key) WHERE dedupe_key IS NOT NULL;

GRANT SELECT ON public.orbit_flow_events TO authenticated;
GRANT ALL ON public.orbit_flow_events TO service_role;
ALTER TABLE public.orbit_flow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_events tenant read"
  ON public.orbit_flow_events FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id));

-- ========== orbit_flow_runs ==========
CREATE TABLE IF NOT EXISTS public.orbit_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.orbit_flows(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.orbit_flow_events(id) ON DELETE SET NULL,
  empresa_id uuid NOT NULL,
  entity_type text,
  entity_id uuid,
  status public.orbit_flow_run_status NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orbit_flow_runs_flow_event
  ON public.orbit_flow_runs(flow_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orbit_flow_runs_flow ON public.orbit_flow_runs(flow_id, created_at DESC);

GRANT SELECT ON public.orbit_flow_runs TO authenticated;
GRANT ALL ON public.orbit_flow_runs TO service_role;
ALTER TABLE public.orbit_flow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_runs tenant read"
  ON public.orbit_flow_runs FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id));

DROP TRIGGER IF EXISTS trg_orbit_flow_runs_updated ON public.orbit_flow_runs;
CREATE TRIGGER trg_orbit_flow_runs_updated
  BEFORE UPDATE ON public.orbit_flow_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== orbit_flow_run_steps ==========
CREATE TABLE IF NOT EXISTS public.orbit_flow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.orbit_flow_runs(id) ON DELETE CASCADE,
  action_id uuid REFERENCES public.orbit_flow_actions(id) ON DELETE SET NULL,
  ordem int NOT NULL DEFAULT 0,
  status public.orbit_flow_run_status NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  output jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orbit_flow_run_steps_run ON public.orbit_flow_run_steps(run_id, ordem);

GRANT SELECT ON public.orbit_flow_run_steps TO authenticated;
GRANT ALL ON public.orbit_flow_run_steps TO service_role;
ALTER TABLE public.orbit_flow_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_run_steps tenant read"
  ON public.orbit_flow_run_steps FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orbit_flow_runs r
    WHERE r.id = run_id AND public.user_has_empresa_access(r.empresa_id)
  ));

-- ========== Seed templates ==========
INSERT INTO public.orbit_flow_templates (nome, descricao, categoria, definicao) VALUES
  ('Nutrir lead frio 7d',
   'Envia mensagem de follow-up quando deal não se move há 7 dias.',
   'nutricao',
   jsonb_build_object(
     'trigger_type','deal_idle',
     'trigger_config', jsonb_build_object('dias',7),
     'condicoes', jsonb_build_object(),
     'actions', jsonb_build_array(
       jsonb_build_object('action_type','send_whatsapp_template','action_config', jsonb_build_object('template_slug','followup_7d'),'delay_seconds',0)
     )
   )
  ),
  ('Lembrete pós-proposta',
   'Cria tarefa para o vendedor 2 dias após mover para Proposta.',
   'pipeline',
   jsonb_build_object(
     'trigger_type','deal_stage_changed',
     'trigger_config', jsonb_build_object('to_stage_name','Proposta'),
     'condicoes', jsonb_build_object(),
     'actions', jsonb_build_array(
       jsonb_build_object('action_type','create_task','action_config', jsonb_build_object('titulo','Follow-up de proposta','prazo_dias',2),'delay_seconds',0),
       jsonb_build_object('action_type','notify_vendedor','action_config', jsonb_build_object('canal','email'),'delay_seconds',0)
     )
   )
  ),
  ('Ativar IA em leads novos',
   'Quando prospect é qualificado, garante que IA está ligada na conversa.',
   'ia',
   jsonb_build_object(
     'trigger_type','prospect_qualified',
     'trigger_config', jsonb_build_object(),
     'condicoes', jsonb_build_object(),
     'actions', jsonb_build_array(
       jsonb_build_object('action_type','toggle_ai_agent','action_config', jsonb_build_object('human_talk', false),'delay_seconds',0)
     )
   )
  )
ON CONFLICT DO NOTHING;
