
-- =====================================================================
-- FASE 1+2: Fila global de WhatsApp (outbox) — fundação
-- =====================================================================

-- 1) Coluna de feature flag no config existente (default false para todos)
ALTER TABLE public.orbit_whatsapp_sending_config
  ADD COLUMN IF NOT EXISTS outbox_adapter_enabled boolean NOT NULL DEFAULT false;

-- 2) Tabela orbit_whatsapp_outbox
CREATE TABLE IF NOT EXISTS public.orbit_whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  conversa_id uuid NULL,
  prospect_id uuid NULL,
  deal_id uuid NULL,
  campaign_id uuid NULL,
  flow_run_id uuid NULL,
  scheduled_action_id uuid NULL,
  source_type text NOT NULL,
  source_id text NULL,
  idempotency_key text NOT NULL,
  priority int NOT NULL DEFAULT 50,
  payload_type text NOT NULL DEFAULT 'text',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  locked_at timestamptz NULL,
  locked_by text NULL,
  next_attempt_at timestamptz NULL,
  last_error text NULL,
  provider_message_id text NULL,
  sent_at timestamptz NULL,
  canceled_at timestamptz NULL,
  canceled_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_whatsapp_outbox_source_type_chk
    CHECK (source_type IN ('ai_reply','meeting_confirmation','manual','flow_initial','flow_followup','campaign')),
  CONSTRAINT orbit_whatsapp_outbox_status_chk
    CHECK (status IN ('pending','processing','sent','failed','canceled','simulated')),
  CONSTRAINT orbit_whatsapp_outbox_payload_type_chk
    CHECK (payload_type IN ('text','image','audio','document','video')),
  CONSTRAINT orbit_whatsapp_outbox_uniq UNIQUE (empresa_id, idempotency_key)
);

-- 3) Grants
GRANT SELECT ON public.orbit_whatsapp_outbox TO authenticated;
GRANT ALL ON public.orbit_whatsapp_outbox TO service_role;

-- 4) RLS
ALTER TABLE public.orbit_whatsapp_outbox ENABLE ROW LEVEL SECURITY;

-- Tenant/super_admin podem SELECT
DROP POLICY IF EXISTS outbox_select_tenant ON public.orbit_whatsapp_outbox;
CREATE POLICY outbox_select_tenant ON public.orbit_whatsapp_outbox
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.empresa_id = orbit_whatsapp_outbox.empresa_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_memberships m
      WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_whatsapp_outbox.empresa_id
    )
  );

-- Escrita só service_role (sem policy para authenticated)

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_outbox_claim
  ON public.orbit_whatsapp_outbox (status, scheduled_for, priority DESC, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbox_empresa_status
  ON public.orbit_whatsapp_outbox (empresa_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_outbox_prospect
  ON public.orbit_whatsapp_outbox (prospect_id) WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_conversa
  ON public.orbit_whatsapp_outbox (conversa_id) WHERE conversa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_campaign
  ON public.orbit_whatsapp_outbox (campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_processing_lease
  ON public.orbit_whatsapp_outbox (locked_at) WHERE status = 'processing';

-- 6) Trigger updated_at
CREATE OR REPLACE FUNCTION public.orbit_whatsapp_outbox_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbox_touch ON public.orbit_whatsapp_outbox;
CREATE TRIGGER trg_outbox_touch
BEFORE UPDATE ON public.orbit_whatsapp_outbox
FOR EACH ROW EXECUTE FUNCTION public.orbit_whatsapp_outbox_touch();

-- 7) Claim RPC — reserva itens elegíveis com FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.outbox_claim_batch(
  _empresa_id uuid,
  _batch int DEFAULT 10,
  _worker_id text DEFAULT NULL,
  _lease_seconds int DEFAULT 120
)
RETURNS SETOF public.orbit_whatsapp_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _lease_cutoff timestamptz := _now - make_interval(secs => _lease_seconds);
BEGIN
  -- Lease recovery: solta processing travado antes de claim
  UPDATE public.orbit_whatsapp_outbox
     SET status = 'pending', locked_at = NULL, locked_by = NULL
   WHERE empresa_id = _empresa_id
     AND status = 'processing'
     AND locked_at IS NOT NULL
     AND locked_at < _lease_cutoff;

  RETURN QUERY
  WITH claimable AS (
    SELECT id
      FROM public.orbit_whatsapp_outbox
     WHERE empresa_id = _empresa_id
       AND status = 'pending'
       AND scheduled_for <= _now
       AND (next_attempt_at IS NULL OR next_attempt_at <= _now)
     ORDER BY priority DESC, scheduled_for ASC, created_at ASC
     LIMIT GREATEST(1, LEAST(_batch, 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.orbit_whatsapp_outbox o
     SET status = 'processing',
         locked_at = _now,
         locked_by = COALESCE(_worker_id, 'worker'),
         attempts = o.attempts + 1
    FROM claimable c
   WHERE o.id = c.id
   RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.outbox_claim_batch(uuid, int, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbox_claim_batch(uuid, int, text, int) TO service_role;

-- 8) Cancel RPC — cancela pendentes de um prospect por motivo
CREATE OR REPLACE FUNCTION public.outbox_cancel_by_prospect(
  _empresa_id uuid,
  _prospect_id uuid,
  _reason text,
  _sources text[] DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  UPDATE public.orbit_whatsapp_outbox
     SET status = 'canceled',
         canceled_at = now(),
         canceled_reason = _reason,
         locked_at = NULL,
         locked_by = NULL
   WHERE empresa_id = _empresa_id
     AND prospect_id = _prospect_id
     AND status IN ('pending','processing')
     AND (_sources IS NULL OR source_type = ANY(_sources));
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.outbox_cancel_by_prospect(uuid, uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbox_cancel_by_prospect(uuid, uuid, text, text[]) TO service_role;

-- 9) Reconcile RPC — recalcula contadores da campanha
CREATE OR REPLACE FUNCTION public.reconcile_campaign_counters(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int := 0;
  _enviados int := 0;
  _falhas int := 0;
  _aberturas int := 0;
  _cliques int := 0;
  _respostas int := 0;
BEGIN
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status IN ('enviada','sent','entregue','delivered','aberto','clicado','respondida'))::int,
    COUNT(*) FILTER (WHERE status IN ('falha','failed','erro','error','bounced'))::int,
    COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE status IN ('respondida','replied'))::int
    INTO _total, _enviados, _falhas, _aberturas, _cliques, _respostas
  FROM public.orbit_campaign_recipients
  WHERE campaign_id = _campaign_id;

  UPDATE public.orbit_campaigns
     SET total_destinatarios = _total,
         enviados = _enviados,
         falhas = _falhas,
         aberturas = _aberturas,
         cliques = _cliques,
         respostas = _respostas,
         updated_at = now()
   WHERE id = _campaign_id;

  RETURN jsonb_build_object(
    'campaign_id', _campaign_id,
    'total', _total,
    'enviados', _enviados,
    'falhas', _falhas,
    'aberturas', _aberturas,
    'cliques', _cliques,
    'respostas', _respostas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_campaign_counters(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_campaign_counters(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_campaign_counters(uuid) TO authenticated;
