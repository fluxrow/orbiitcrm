-- ─────────────────────────────────────────────────────────────
-- 1) Estado de conexão da instância Z-API (fail-closed global)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.orbit_zapi_config
  ADD COLUMN IF NOT EXISTS instance_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offline_since timestamptz,
  ADD COLUMN IF NOT EXISTS offline_reason text,
  ADD COLUMN IF NOT EXISTS last_status_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_online_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_block_until timestamptz,
  ADD COLUMN IF NOT EXISTS offline_alert_sent_at timestamptz;

COMMENT ON COLUMN public.orbit_zapi_config.instance_offline IS
  'true quando o heartbeat/webhook detectou instância desconectada. Bloqueia envio real (fail-closed).';
COMMENT ON COLUMN public.orbit_zapi_config.send_block_until IS
  'Trava temporal de envio (ex.: bloqueio 24h da Z-API). Enquanto no futuro, nenhum envio real ocorre.';

-- ─────────────────────────────────────────────────────────────
-- 2) Eventos de status da instância (auditoria + dedupe de alerta)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orbit_zapi_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  zapi_config_id uuid REFERENCES public.orbit_zapi_config(id) ON DELETE SET NULL,
  instance_id text,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'webhook',
  status_code integer,
  reason text,
  alert_sent boolean NOT NULL DEFAULT false,
  alert_attempts integer NOT NULL DEFAULT 0,
  alert_last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_zapi_status_events TO authenticated;
GRANT ALL ON public.orbit_zapi_status_events TO service_role;
ALTER TABLE public.orbit_zapi_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orbit_zapi_status_events_select_empresa ON public.orbit_zapi_status_events;
CREATE POLICY orbit_zapi_status_events_select_empresa
  ON public.orbit_zapi_status_events FOR SELECT TO authenticated
  USING (empresa_id IS NOT NULL AND public.user_has_empresa_access(empresa_id));

DROP POLICY IF EXISTS orbit_zapi_status_events_select_super_admin ON public.orbit_zapi_status_events;
CREATE POLICY orbit_zapi_status_events_select_super_admin
  ON public.orbit_zapi_status_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_orbit_zapi_status_events_empresa_created
  ON public.orbit_zapi_status_events (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orbit_zapi_status_events_instance_created
  ON public.orbit_zapi_status_events (instance_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3) Tags manuais por tenant
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orbit_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#f9b217',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_tags_nome_len CHECK (char_length(btrim(nome)) BETWEEN 1 AND 40),
  CONSTRAINT orbit_tags_cor_hex CHECK (cor ~ '^#[0-9a-fA-F]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS orbit_tags_empresa_nome_uniq
  ON public.orbit_tags (empresa_id, lower(btrim(nome)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_tags TO authenticated;
GRANT ALL ON public.orbit_tags TO service_role;
ALTER TABLE public.orbit_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orbit_tags_select ON public.orbit_tags;
CREATE POLICY orbit_tags_select ON public.orbit_tags FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id) AND public.pe_user_is_orbit_member(auth.uid()));

DROP POLICY IF EXISTS orbit_tags_insert ON public.orbit_tags;
CREATE POLICY orbit_tags_insert ON public.orbit_tags FOR INSERT TO authenticated
  WITH CHECK (public.user_has_empresa_access(empresa_id) AND public.pe_user_is_orbit_member(auth.uid()));

DROP POLICY IF EXISTS orbit_tags_update ON public.orbit_tags;
CREATE POLICY orbit_tags_update ON public.orbit_tags FOR UPDATE TO authenticated
  USING (public.user_has_empresa_access(empresa_id) AND public.pe_user_is_orbit_member(auth.uid()))
  WITH CHECK (public.user_has_empresa_access(empresa_id) AND public.pe_user_is_orbit_member(auth.uid()));

DROP POLICY IF EXISTS orbit_tags_delete ON public.orbit_tags;
CREATE POLICY orbit_tags_delete ON public.orbit_tags FOR DELETE TO authenticated
  USING (public.user_has_empresa_access(empresa_id) AND public.pe_user_is_orbit_member(auth.uid()));

DROP POLICY IF EXISTS orbit_tags_super_admin ON public.orbit_tags;
CREATE POLICY orbit_tags_super_admin ON public.orbit_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP TRIGGER IF EXISTS update_orbit_tags_updated_at ON public.orbit_tags;
CREATE TRIGGER update_orbit_tags_updated_at
  BEFORE UPDATE ON public.orbit_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.orbit_prospect_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES public.orbit_prospects(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.orbit_tags(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_prospect_tags_uniq UNIQUE (prospect_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_orbit_prospect_tags_prospect ON public.orbit_prospect_tags (prospect_id);
CREATE INDEX IF NOT EXISTS idx_orbit_prospect_tags_tag ON public.orbit_prospect_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_orbit_prospect_tags_empresa ON public.orbit_prospect_tags (empresa_id);

GRANT SELECT, INSERT, DELETE ON public.orbit_prospect_tags TO authenticated;
GRANT ALL ON public.orbit_prospect_tags TO service_role;
ALTER TABLE public.orbit_prospect_tags ENABLE ROW LEVEL SECURITY;

-- Vínculo exige que tag E prospect pertençam à MESMA empresa da linha.
DROP POLICY IF EXISTS orbit_prospect_tags_select ON public.orbit_prospect_tags;
CREATE POLICY orbit_prospect_tags_select ON public.orbit_prospect_tags FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id) AND public.pe_user_is_orbit_member(auth.uid()));

DROP POLICY IF EXISTS orbit_prospect_tags_insert ON public.orbit_prospect_tags;
CREATE POLICY orbit_prospect_tags_insert ON public.orbit_prospect_tags FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_empresa_access(empresa_id)
    AND public.pe_user_is_orbit_member(auth.uid())
    AND EXISTS (SELECT 1 FROM public.orbit_tags t WHERE t.id = tag_id AND t.empresa_id = orbit_prospect_tags.empresa_id)
    AND EXISTS (SELECT 1 FROM public.orbit_prospects p WHERE p.id = prospect_id AND p.empresa_id = orbit_prospect_tags.empresa_id)
  );

DROP POLICY IF EXISTS orbit_prospect_tags_delete ON public.orbit_prospect_tags;
CREATE POLICY orbit_prospect_tags_delete ON public.orbit_prospect_tags FOR DELETE TO authenticated
  USING (public.user_has_empresa_access(empresa_id) AND public.pe_user_is_orbit_member(auth.uid()));

DROP POLICY IF EXISTS orbit_prospect_tags_super_admin ON public.orbit_prospect_tags;
CREATE POLICY orbit_prospect_tags_super_admin ON public.orbit_prospect_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Backend guard: coerência de tenant também no servidor (independe de RLS).
CREATE OR REPLACE FUNCTION public.orbit_prospect_tags_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tag_empresa uuid;
  _prospect_empresa uuid;
BEGIN
  SELECT empresa_id INTO _tag_empresa FROM public.orbit_tags WHERE id = NEW.tag_id;
  SELECT empresa_id INTO _prospect_empresa FROM public.orbit_prospects WHERE id = NEW.prospect_id;

  IF _tag_empresa IS NULL OR _prospect_empresa IS NULL THEN
    RAISE EXCEPTION 'tag ou prospect inexistente';
  END IF;

  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := _prospect_empresa;
  END IF;

  IF _tag_empresa <> NEW.empresa_id OR _prospect_empresa <> NEW.empresa_id THEN
    RAISE EXCEPTION 'tag e prospect devem pertencer a mesma empresa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orbit_prospect_tags_guard_trg ON public.orbit_prospect_tags;
CREATE TRIGGER orbit_prospect_tags_guard_trg
  BEFORE INSERT OR UPDATE ON public.orbit_prospect_tags
  FOR EACH ROW EXECUTE FUNCTION public.orbit_prospect_tags_guard();

-- ─────────────────────────────────────────────────────────────
-- 4) Status de conexão: agora considera heartbeat/instance_offline
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.orbit_zapi_connection_status(uuid);
CREATE OR REPLACE FUNCTION public.orbit_zapi_connection_status(_empresa_id uuid)
RETURNS TABLE(
  status text,
  instance_id text,
  last_disconnect_at timestamptz,
  last_receive_at timestamptz,
  disconnect_reason text,
  instance_offline boolean,
  send_block_until timestamptz,
  last_status_check_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _has_access boolean;
  _cfg record;
  _last_disc_at timestamptz;
  _last_disc_err text;
  _last_recv timestamptz;
  _status text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND empresa_id = _empresa_id
    UNION ALL
    SELECT 1 FROM public.user_empresa_memberships WHERE user_id = auth.uid() AND empresa_id = _empresa_id
  ) INTO _has_access;

  IF NOT _has_access AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN;
  END IF;

  SELECT z.instance_id, z.instance_offline, z.offline_since, z.offline_reason,
         z.send_block_until, z.last_status_check_at
  INTO _cfg
  FROM public.orbit_zapi_config z
  WHERE z.empresa_id = _empresa_id AND z.ativo = true
  LIMIT 1;

  IF _cfg.instance_id IS NULL THEN
    RETURN QUERY SELECT 'not_configured'::text, NULL::text, NULL::timestamptz, NULL::timestamptz,
                        NULL::text, false, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT w.created_at, w.payload->>'error'
  INTO _last_disc_at, _last_disc_err
  FROM public.orbit_webhook_logs w
  WHERE w.instance_id = _cfg.instance_id AND w.event_type = 'on-disconnect'
  ORDER BY w.created_at DESC
  LIMIT 1;

  SELECT MAX(w.created_at) INTO _last_recv
  FROM public.orbit_webhook_logs w
  WHERE w.instance_id = _cfg.instance_id AND w.event_type = 'on-receive';

  IF _cfg.instance_offline
     OR (_last_disc_at IS NOT NULL AND (_last_recv IS NULL OR _last_disc_at > _last_recv)) THEN
    _status := 'disconnected';
  ELSE
    _status := 'connected';
  END IF;

  RETURN QUERY SELECT
    _status,
    _cfg.instance_id,
    COALESCE(_cfg.offline_since, _last_disc_at),
    _last_recv,
    COALESCE(_cfg.offline_reason, _last_disc_err),
    COALESCE(_cfg.instance_offline, false),
    _cfg.send_block_until,
    _cfg.last_status_check_at;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.orbit_zapi_connection_status(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) Heartbeat global a cada 15 minutos
-- ─────────────────────────────────────────────────────────────
SELECT cron.unschedule('orbit-zapi-heartbeat-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'orbit-zapi-heartbeat-15min');

SELECT cron.schedule(
  'orbit-zapi-heartbeat-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oqsnzwkiwgqwopuaugxj.supabase.co/functions/v1/orbit-zapi-heartbeat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer 39639b6c2d2c73ea891d67dd28ac534f238593977e75c97a158f19589521e255'
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);