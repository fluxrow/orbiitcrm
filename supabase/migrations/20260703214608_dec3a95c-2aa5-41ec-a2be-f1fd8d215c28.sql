
-- ============================================================
-- Orbit Advisor — Fase 1: schema + snapshot function
-- ============================================================

-- 0. Coluna de guardrail no orbit_ai_config
ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS advisor_locked_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 1. Threads
CREATE TABLE IF NOT EXISTS public.orbit_advisor_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  titulo text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advisor_threads_empresa_user ON public.orbit_advisor_threads (empresa_id, user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_advisor_threads TO authenticated;
GRANT ALL ON public.orbit_advisor_threads TO service_role;
ALTER TABLE public.orbit_advisor_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_threads owner read"
  ON public.orbit_advisor_threads FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.user_has_empresa_access(empresa_id));
CREATE POLICY "advisor_threads owner write"
  ON public.orbit_advisor_threads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.user_has_empresa_access(empresa_id));
CREATE POLICY "advisor_threads owner update"
  ON public.orbit_advisor_threads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "advisor_threads owner delete"
  ON public.orbit_advisor_threads FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 2. Messages
CREATE TABLE IF NOT EXISTS public.orbit_advisor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.orbit_advisor_threads(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls jsonb,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advisor_messages_thread ON public.orbit_advisor_messages (thread_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.orbit_advisor_messages TO authenticated;
GRANT ALL ON public.orbit_advisor_messages TO service_role;
ALTER TABLE public.orbit_advisor_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_messages tenant read"
  ON public.orbit_advisor_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orbit_advisor_threads t
    WHERE t.id = orbit_advisor_messages.thread_id AND t.user_id = auth.uid()
  ));
CREATE POLICY "advisor_messages owner insert"
  ON public.orbit_advisor_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orbit_advisor_threads t
    WHERE t.id = orbit_advisor_messages.thread_id AND t.user_id = auth.uid()
  ));

-- 3. Suggestions
CREATE TABLE IF NOT EXISTS public.orbit_advisor_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  racional text,
  risco text NOT NULL DEFAULT 'baixo' CHECK (risco IN ('baixo','medio','alto')),
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed','blocked','expired')),
  criada_por text NOT NULL DEFAULT 'scan' CHECK (criada_por IN ('scan','chat','manual')),
  blocked_reason text,
  user_confirmed_at timestamptz,
  user_confirmed_by uuid,
  applied_change_id uuid,
  gerada_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advisor_suggestions_empresa_status
  ON public.orbit_advisor_suggestions (empresa_id, status, gerada_em DESC);

GRANT SELECT, UPDATE ON public.orbit_advisor_suggestions TO authenticated;
GRANT ALL ON public.orbit_advisor_suggestions TO service_role;
ALTER TABLE public.orbit_advisor_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_suggestions tenant read"
  ON public.orbit_advisor_suggestions FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id));
CREATE POLICY "advisor_suggestions tenant update"
  ON public.orbit_advisor_suggestions FOR UPDATE TO authenticated
  USING (public.user_has_empresa_access(empresa_id))
  WITH CHECK (public.user_has_empresa_access(empresa_id));

-- 4. Applied changes
CREATE TABLE IF NOT EXISTS public.orbit_advisor_applied_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  suggestion_id uuid REFERENCES public.orbit_advisor_suggestions(id) ON DELETE SET NULL,
  applied_by uuid NOT NULL,
  target_kind text NOT NULL,
  target_id uuid,
  snapshot_before jsonb,
  snapshot_after jsonb,
  rollback_of uuid REFERENCES public.orbit_advisor_applied_changes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advisor_applied_empresa ON public.orbit_advisor_applied_changes (empresa_id, created_at DESC);

GRANT SELECT ON public.orbit_advisor_applied_changes TO authenticated;
GRANT ALL ON public.orbit_advisor_applied_changes TO service_role;
ALTER TABLE public.orbit_advisor_applied_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_applied tenant read"
  ON public.orbit_advisor_applied_changes FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id));

-- 5. Snapshots (série temporal para deltas)
CREATE TABLE IF NOT EXISTS public.orbit_advisor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  taken_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_advisor_snapshots_empresa_time
  ON public.orbit_advisor_snapshots (empresa_id, taken_at DESC);

GRANT SELECT ON public.orbit_advisor_snapshots TO authenticated;
GRANT ALL ON public.orbit_advisor_snapshots TO service_role;
ALTER TABLE public.orbit_advisor_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_snapshots tenant read"
  ON public.orbit_advisor_snapshots FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id));

-- 6. Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_advisor_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_advisor_threads_touch ON public.orbit_advisor_threads;
CREATE TRIGGER trg_advisor_threads_touch BEFORE UPDATE ON public.orbit_advisor_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_advisor_updated_at();

DROP TRIGGER IF EXISTS trg_advisor_suggestions_touch ON public.orbit_advisor_suggestions;
CREATE TRIGGER trg_advisor_suggestions_touch BEFORE UPDATE ON public.orbit_advisor_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_advisor_updated_at();

-- 7. get_advisor_snapshot — JSON compacto pronto para o LLM
CREATE OR REPLACE FUNCTION public.get_advisor_snapshot(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_empresa jsonb;
  v_ai_config jsonb;
  v_pipeline jsonb;
  v_flows jsonb;
  v_kpis jsonb;
  v_since_24h timestamptz := now() - interval '24 hours';
  v_since_7d timestamptz := now() - interval '7 days';
  v_since_30d timestamptz := now() - interval '30 days';
BEGIN
  IF NOT public.user_has_empresa_access(p_empresa_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'id', id, 'nome', nome, 'plano', plano, 'slug', slug,
    'seats_max', max_usuarios
  ) INTO v_empresa
  FROM public.orbit_empresas WHERE id = p_empresa_id;

  SELECT jsonb_build_object(
    'tom', tom_conversa,
    'idioma', idioma,
    'modelo', modelo_ia,
    'modo_automatico', modo_automatico,
    'identidade_resumo', LEFT(COALESCE(prompt_identidade,''), 400),
    'regras_resumo', LEFT(COALESCE(prompt_regras,''), 400),
    'advisor_locked_paths', COALESCE(advisor_locked_paths, '[]'::jsonb)
  ) INTO v_ai_config
  FROM public.orbit_ai_config WHERE empresa_id = p_empresa_id
  ORDER BY updated_at DESC LIMIT 1;

  -- Funil: leads ativos por etapa (via orbit_deals) + throughput 7d/30d
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY (s->>'ordem')::int), '[]'::jsonb)
  INTO v_pipeline
  FROM (
    SELECT
      st.id, st.nome, st.ordem, st.is_won, st.is_lost, st.sla_dias,
      (SELECT count(*) FROM public.orbit_deals d
        WHERE d.empresa_id = p_empresa_id AND d.etapa_id = st.id) AS leads_ativos,
      (SELECT count(*) FROM public.orbit_deals d
        WHERE d.empresa_id = p_empresa_id AND d.etapa_id = st.id
          AND d.updated_at >= v_since_7d) AS mov_7d,
      (SELECT count(*) FROM public.orbit_deals d
        WHERE d.empresa_id = p_empresa_id AND d.etapa_id = st.id
          AND d.updated_at >= v_since_30d) AS mov_30d
    FROM public.orbit_pipeline_stages st
    WHERE st.empresa_id = p_empresa_id AND st.is_archived = false
  ) s;

  -- Saúde dos fluxos (24h)
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY (f->>'erros_24h')::int DESC NULLS LAST), '[]'::jsonb)
  INTO v_flows
  FROM (
    SELECT
      fl.id, fl.nome, fl.ativo,
      (SELECT count(*) FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.created_at >= v_since_24h) AS runs_24h,
      (SELECT count(*) FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.created_at >= v_since_24h AND r.error IS NOT NULL) AS erros_24h,
      (SELECT extract(epoch FROM percentile_cont(0.95) WITHIN GROUP (ORDER BY (r.finished_at - r.started_at)))
         FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.created_at >= v_since_24h AND r.finished_at IS NOT NULL) AS latencia_p95_s,
      (SELECT r.error FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.error IS NOT NULL
         ORDER BY r.created_at DESC LIMIT 1) AS ultimo_erro
    FROM public.orbit_flows fl
    WHERE fl.empresa_id = p_empresa_id AND fl.deleted_at IS NULL
  ) f;

  -- KPIs tenant-scoped (últimas 24h)
  SELECT jsonb_build_object(
    'prospects_24h', (SELECT count(*) FROM public.orbit_prospects
                       WHERE empresa_id = p_empresa_id AND created_at >= v_since_24h),
    'prospects_7d', (SELECT count(*) FROM public.orbit_prospects
                      WHERE empresa_id = p_empresa_id AND created_at >= v_since_7d),
    'tasks_atrasadas', (SELECT count(*) FROM public.orbit_tasks
                         WHERE empresa_id = p_empresa_id
                           AND status <> 'concluida'
                           AND (data_prazo IS NOT NULL AND data_prazo < now())),
    'conversas_abertas', (SELECT count(*) FROM public.orbit_conversas
                           WHERE empresa_id = p_empresa_id AND status = 'aberta'),
    'handoffs_pendentes', (SELECT count(*) FROM public.orbit_handoffs
                            WHERE empresa_id = p_empresa_id AND status = 'pendente')
  ) INTO v_kpis;

  v_result := jsonb_build_object(
    'gerado_em', now(),
    'empresa', v_empresa,
    'ai_config', v_ai_config,
    'pipeline', COALESCE(v_pipeline, '[]'::jsonb),
    'flows', COALESCE(v_flows, '[]'::jsonb),
    'kpis', v_kpis
  );

  RETURN v_result;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  -- degrade gracefully se algum campo opcional não existir num ambiente
  RETURN jsonb_build_object(
    'gerado_em', now(),
    'empresa', v_empresa,
    'ai_config', v_ai_config,
    'pipeline', COALESCE(v_pipeline, '[]'::jsonb),
    'flows', COALESCE(v_flows, '[]'::jsonb),
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'warning', 'partial_snapshot'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_advisor_snapshot(uuid) TO authenticated, service_role;
