
-- 1) Expandir CHECK de status para incluir 'ignorado' (terminal, separado de falhou)
ALTER TABLE public.orbit_campaign_recipients
  DROP CONSTRAINT IF EXISTS orbit_campaign_recipients_status_check;

ALTER TABLE public.orbit_campaign_recipients
  ADD CONSTRAINT orbit_campaign_recipients_status_check
  CHECK (status = ANY (ARRAY[
    'pendente'::text,'enviado'::text,'falhou'::text,'entregue'::text,
    'lido'::text,'clicado'::text,'bounce'::text,'respondeu'::text,
    'simulated'::text,'ignorado'::text
  ]));

-- 2) Colunas de auditoria do ignorado
ALTER TABLE public.orbit_campaign_recipients
  ADD COLUMN IF NOT EXISTS ignorado_em timestamptz,
  ADD COLUMN IF NOT EXISTS ignorado_motivo text;

-- 3) Contador de ignorados na campanha
ALTER TABLE public.orbit_campaigns
  ADD COLUMN IF NOT EXISTS ignorados integer NOT NULL DEFAULT 0;

-- 4) Reconcile atualizado: enviados/falhas/ignorados e conclusão segura
CREATE OR REPLACE FUNCTION public.reconcile_campaign_counters(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _enviados int;
  _falhas int;
  _ignorados int;
  _pending int;
  _outbox_open int;
  _current_status text;
  _new_status text;
BEGIN
  SELECT count(*) INTO _total
    FROM public.orbit_campaign_recipients WHERE campaign_id = _campaign_id;

  SELECT count(*) INTO _enviados
    FROM public.orbit_campaign_recipients
    WHERE campaign_id = _campaign_id AND status IN ('enviado','entregue','lido','clicado','respondeu','simulated');

  SELECT count(*) INTO _falhas
    FROM public.orbit_campaign_recipients
    WHERE campaign_id = _campaign_id AND status IN ('falhou','bounce');

  SELECT count(*) INTO _ignorados
    FROM public.orbit_campaign_recipients
    WHERE campaign_id = _campaign_id AND status = 'ignorado';

  SELECT count(*) INTO _pending
    FROM public.orbit_campaign_recipients
    WHERE campaign_id = _campaign_id AND status = 'pendente';

  SELECT count(*) INTO _outbox_open
    FROM public.orbit_whatsapp_outbox
    WHERE campaign_id = _campaign_id AND status IN ('pending','processing');

  SELECT status INTO _current_status FROM public.orbit_campaigns WHERE id = _campaign_id;

  -- Concluir SÓ quando: não há pendentes, não há outbox em curso, e status não é terminal manual
  IF _pending = 0 AND _outbox_open = 0
     AND _current_status NOT IN ('pausada','reprovada','cancelada','concluida','falha') THEN
    _new_status := CASE
      WHEN _enviados = 0 AND _falhas > 0 THEN 'falha'
      ELSE 'concluida'
    END;
  ELSE
    _new_status := _current_status;
  END IF;

  UPDATE public.orbit_campaigns
     SET total_destinatarios = _total,
         enviados = _enviados,
         falhas = _falhas,
         ignorados = _ignorados,
         status = _new_status,
         updated_at = now()
   WHERE id = _campaign_id;

  RETURN jsonb_build_object(
    'campaign_id', _campaign_id,
    'total', _total,
    'enviados', _enviados,
    'falhas', _falhas,
    'ignorados', _ignorados,
    'pending', _pending,
    'outbox_open', _outbox_open,
    'status', _new_status
  );
END;
$$;
