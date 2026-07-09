
-- ============================================================
-- Scheduler de ações futuras dos fluxos
-- ============================================================

CREATE TABLE public.orbit_flow_scheduled_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.orbit_flow_runs(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL,
  action_id uuid NULL,
  ordem integer NOT NULL DEFAULT 0,
  action_type text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  prospect_id uuid NULL,
  deal_id uuid NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','success','error','skipped','canceled')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  locked_by uuid,
  canceled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_flow_scheduled_actions TO authenticated;
GRANT ALL ON public.orbit_flow_scheduled_actions TO service_role;

ALTER TABLE public.orbit_flow_scheduled_actions ENABLE ROW LEVEL SECURITY;

-- Reuso do helper existente user_has_empresa_access(_empresa_id)
CREATE POLICY "sched_actions_select_by_empresa"
  ON public.orbit_flow_scheduled_actions
  FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id));

-- Sem INSERT/UPDATE/DELETE para clientes; tudo via service_role.

CREATE INDEX idx_sched_actions_ready
  ON public.orbit_flow_scheduled_actions (scheduled_for)
  WHERE status = 'pending';

CREATE INDEX idx_sched_actions_by_run
  ON public.orbit_flow_scheduled_actions (run_id);

CREATE INDEX idx_sched_actions_by_prospect
  ON public.orbit_flow_scheduled_actions (empresa_id, prospect_id)
  WHERE status IN ('pending','running');

CREATE INDEX idx_sched_actions_by_deal
  ON public.orbit_flow_scheduled_actions (empresa_id, deal_id)
  WHERE status IN ('pending','running');

-- Dedup idempotente por (run_id, ordem) apenas para linhas ativas
CREATE UNIQUE INDEX idx_sched_actions_dedupe
  ON public.orbit_flow_scheduled_actions (run_id, ordem)
  WHERE status IN ('pending','running','success');

-- Trigger updated_at
CREATE TRIGGER trg_sched_actions_touch
  BEFORE UPDATE ON public.orbit_flow_scheduled_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPCs (SECURITY DEFINER, uso interno pelo worker)
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_scheduled_actions(_batch integer DEFAULT 25)
RETURNS SETOF public.orbit_flow_scheduled_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _worker uuid := gen_random_uuid();
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.orbit_flow_scheduled_actions
    WHERE status = 'pending' AND scheduled_for <= now()
    ORDER BY scheduled_for
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(_batch, 100))
  )
  UPDATE public.orbit_flow_scheduled_actions s
  SET status = 'running',
      locked_at = now(),
      locked_by = _worker,
      attempts = s.attempts + 1
  FROM picked
  WHERE s.id = picked.id
  RETURNING s.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_scheduled_actions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_actions(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reschedule_scheduled_action(
  _id uuid,
  _delay_seconds integer,
  _error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orbit_flow_scheduled_actions
  SET status = 'pending',
      scheduled_for = now() + make_interval(secs => GREATEST(_delay_seconds, 1)),
      last_error = _error,
      locked_at = NULL,
      locked_by = NULL
  WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.reschedule_scheduled_action(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_scheduled_action(uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_actions(
  _empresa_id uuid,
  _prospect_id uuid DEFAULT NULL,
  _deal_id uuid DEFAULT NULL,
  _reason text DEFAULT 'canceled'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF _prospect_id IS NULL AND _deal_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.orbit_flow_scheduled_actions
  SET status = 'canceled',
      canceled_reason = COALESCE(_reason, 'canceled'),
      last_error = NULL
  WHERE status = 'pending'
    AND empresa_id = _empresa_id
    AND (
      (_prospect_id IS NOT NULL AND prospect_id = _prospect_id)
      OR (_deal_id IS NOT NULL AND deal_id = _deal_id)
    );
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_scheduled_actions(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_actions(uuid, uuid, uuid, text) TO service_role;

-- ============================================================
-- Triggers de cancelamento automático
-- ============================================================

-- Deal muda para etapa Ganho/Perdido → cancela futuras
CREATE OR REPLACE FUNCTION public.trg_cancel_sched_on_deal_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_won boolean;
  _is_lost boolean;
BEGIN
  IF NEW.etapa_id IS NULL OR NEW.etapa_id IS NOT DISTINCT FROM OLD.etapa_id THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(is_won,false), COALESCE(is_lost,false)
    INTO _is_won, _is_lost
  FROM public.orbit_pipeline_stages WHERE id = NEW.etapa_id;
  IF _is_won OR _is_lost THEN
    PERFORM public.cancel_scheduled_actions(
      NEW.empresa_id,
      NEW.prospect_id,
      NEW.id,
      CASE WHEN _is_won THEN 'deal_won' ELSE 'deal_lost' END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deal_stage_cancel_sched
  AFTER UPDATE OF etapa_id ON public.orbit_deals
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_sched_on_deal_stage();

-- Deal soft-delete → cancela
CREATE OR REPLACE FUNCTION public.trg_cancel_sched_on_deal_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    PERFORM public.cancel_scheduled_actions(NEW.empresa_id, NEW.prospect_id, NEW.id, 'deal_deleted');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deal_delete_cancel_sched
  AFTER UPDATE OF deleted_at ON public.orbit_deals
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_sched_on_deal_delete();

-- Prospect soft-delete → cancela
CREATE OR REPLACE FUNCTION public.trg_cancel_sched_on_prospect_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    PERFORM public.cancel_scheduled_actions(NEW.empresa_id, NEW.id, NULL, 'prospect_deleted');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prospect_delete_cancel_sched
  AFTER UPDATE OF deleted_at ON public.orbit_prospects
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_sched_on_prospect_delete();

-- Reunião agendada para o prospect → cancela futuras (cobre no-show reagendado)
CREATE OR REPLACE FUNCTION public.trg_cancel_sched_on_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.prospect_id IS NOT NULL THEN
    PERFORM public.cancel_scheduled_actions(NEW.empresa_id, NEW.prospect_id, NULL, 'meeting_scheduled');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meeting_cancel_sched
  AFTER INSERT ON public.orbit_meetings
  FOR EACH ROW EXECUTE FUNCTION public.trg_cancel_sched_on_meeting();
