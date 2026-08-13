-- Debounce de resposta ativa + observabilidade de SLA (tenant-scoped).
ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS ai_reply_debounce jsonb;

COMMENT ON COLUMN public.orbit_ai_config.ai_reply_debounce IS
  'Debounce da resposta ativa: {"enabled":true,"wait_ms":20000,"sla_ms":60000}. Sem enabled=true o comportamento legado permanece.';

CREATE TABLE IF NOT EXISTS public.orbit_ai_reply_debounce (
  conversa_id uuid PRIMARY KEY REFERENCES public.orbit_conversas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL,
  prospect_id uuid,
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  last_inbound_at timestamptz NOT NULL DEFAULT now(),
  last_inbound_message_id uuid,
  fire_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  batch_size integer NOT NULL DEFAULT 1,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_ai_reply_debounce_status_chk
    CHECK (status IN ('pending','generating','done','canceled'))
);

CREATE INDEX IF NOT EXISTS orbit_ai_reply_debounce_due_idx
  ON public.orbit_ai_reply_debounce (empresa_id, status, fire_after);

GRANT SELECT ON public.orbit_ai_reply_debounce TO authenticated;
GRANT ALL ON public.orbit_ai_reply_debounce TO service_role;
ALTER TABLE public.orbit_ai_reply_debounce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_reply_debounce_select_tenant ON public.orbit_ai_reply_debounce;
CREATE POLICY ai_reply_debounce_select_tenant
  ON public.orbit_ai_reply_debounce FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id = orbit_ai_reply_debounce.empresa_id)
    OR EXISTS (SELECT 1 FROM public.user_empresa_memberships m WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_ai_reply_debounce.empresa_id)
  );

CREATE TABLE IF NOT EXISTS public.orbit_ai_reply_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  conversa_id uuid,
  inbound_message_id text NOT NULL,
  outbox_id uuid,
  batch_size integer NOT NULL DEFAULT 1,
  received_at timestamptz,
  ai_generated_at timestamptz,
  queued_at timestamptz,
  wait_ms integer NOT NULL DEFAULT 20000,
  sla_ms integer NOT NULL DEFAULT 60000,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_ai_reply_sla_unique UNIQUE (empresa_id, inbound_message_id)
);

CREATE INDEX IF NOT EXISTS orbit_ai_reply_sla_empresa_idx
  ON public.orbit_ai_reply_sla (empresa_id, created_at DESC);

GRANT SELECT ON public.orbit_ai_reply_sla TO authenticated;
GRANT ALL ON public.orbit_ai_reply_sla TO service_role;
ALTER TABLE public.orbit_ai_reply_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_reply_sla_select_tenant ON public.orbit_ai_reply_sla;
CREATE POLICY ai_reply_sla_select_tenant
  ON public.orbit_ai_reply_sla FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.empresa_id = orbit_ai_reply_sla.empresa_id)
    OR EXISTS (SELECT 1 FROM public.user_empresa_memberships m WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_ai_reply_sla.empresa_id)
  );

-- Observabilidade: received_at -> ai_generated_at -> queued_at -> sent_at.
CREATE OR REPLACE VIEW public.orbit_ai_reply_sla_view
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.empresa_id,
  s.conversa_id,
  s.inbound_message_id,
  s.batch_size,
  s.received_at,
  s.ai_generated_at,
  s.queued_at,
  o.sent_at,
  s.sla_ms,
  s.wait_ms,
  EXTRACT(EPOCH FROM (s.ai_generated_at - s.received_at)) * 1000 AS debounce_ms,
  EXTRACT(EPOCH FROM (s.queued_at - s.ai_generated_at)) * 1000 AS queue_ms,
  EXTRACT(EPOCH FROM (o.sent_at - s.queued_at)) * 1000 AS send_ms,
  EXTRACT(EPOCH FROM (o.sent_at - s.received_at)) * 1000 AS total_ms,
  CASE
    WHEN o.sent_at IS NULL THEN 'not_sent'
    WHEN EXTRACT(EPOCH FROM (o.sent_at - s.received_at)) * 1000 <= s.sla_ms THEN NULL
    WHEN EXTRACT(EPOCH FROM (o.sent_at - s.queued_at)) >= EXTRACT(EPOCH FROM (s.ai_generated_at - s.received_at)) THEN 'provider_send'
    ELSE 'generation_slow'
  END AS breach_reason
FROM public.orbit_ai_reply_sla s
LEFT JOIN public.orbit_whatsapp_outbox o ON o.id = s.outbox_id;

GRANT SELECT ON public.orbit_ai_reply_sla_view TO authenticated;
GRANT SELECT ON public.orbit_ai_reply_sla_view TO service_role;