ALTER TABLE public.orbit_media_library
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orbit_media_library_empresa_deleted_idx
  ON public.orbit_media_library (empresa_id, deleted_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.orbit_agenda_date_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  reason text NOT NULL,
  is_available boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_agenda_date_exceptions_reason_check CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT orbit_agenda_date_exceptions_tenant_date_key UNIQUE (empresa_id, exception_date)
);

CREATE INDEX IF NOT EXISTS orbit_agenda_date_exceptions_tenant_date_idx
  ON public.orbit_agenda_date_exceptions (empresa_id, exception_date);

ALTER TABLE public.orbit_agenda_date_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orbit_agenda_date_exceptions_select_tenant ON public.orbit_agenda_date_exceptions;
CREATE POLICY orbit_agenda_date_exceptions_select_tenant
ON public.orbit_agenda_date_exceptions
FOR SELECT
TO authenticated
USING (
  empresa_id = (
    SELECT p.empresa_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.ativo = true
  )
);

REVOKE ALL ON public.orbit_agenda_date_exceptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orbit_agenda_date_exceptions TO authenticated, service_role;
GRANT ALL ON public.orbit_agenda_date_exceptions TO service_role;

CREATE OR REPLACE FUNCTION public.orbit_media_active_flow_reference_count(
  p_empresa_id uuid,
  p_media_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT count(DISTINCT f.id)::bigint
  FROM public.orbit_flows f
  LEFT JOIN public.orbit_flow_actions a ON a.flow_id = f.id
  WHERE f.empresa_id = p_empresa_id
    AND f.ativo = true
    AND f.deleted_at IS NULL
    AND (
      strpos(f.trigger_config::text, p_media_id::text) > 0
      OR strpos(f.condicoes::text, p_media_id::text) > 0
      OR strpos(coalesce(a.action_config, '{}'::jsonb)::text, p_media_id::text) > 0
    );
$function$;

REVOKE ALL ON FUNCTION public.orbit_media_active_flow_reference_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_media_active_flow_reference_count(uuid, uuid) TO authenticated, service_role;

DROP VIEW public.orbit_tenant_ops_agenda_v;
CREATE VIEW public.orbit_tenant_ops_agenda_v
WITH (security_invoker = true)
AS
SELECT
  g.empresa_id,
  true AS connected,
  CASE WHEN g.google_email IS NULL THEN NULL
       ELSE left(g.google_email, 2) || '***@' || split_part(g.google_email, '@', 2) END AS google_account_masked,
  CASE WHEN g.calendar_id = 'primary' THEN 'primary'
       WHEN g.calendar_id IS NULL THEN NULL
       ELSE '***' || right(g.calendar_id, 6) END AS calendar_id_masked,
  g.timezone,
  g.availability_start,
  g.availability_end,
  g.availability_break_start,
  g.availability_break_end,
  g.booking_min_notice_minutes,
  g.booking_max_horizon_days,
  (SELECT a.scheduling_meeting_duration_minutes
   FROM public.orbit_ai_config a
   WHERE a.empresa_id = g.empresa_id
   ORDER BY a.updated_at DESC NULLS LAST
   LIMIT 1) AS meeting_duration_default_minutes,
  true AS token_present,
  g.expires_at,
  g.updated_at
FROM public.orbit_google_tokens g;

REVOKE ALL ON public.orbit_tenant_ops_agenda_v FROM PUBLIC, anon;
GRANT SELECT ON public.orbit_tenant_ops_agenda_v TO authenticated, service_role;

DROP VIEW public.orbit_tenant_ops_media_v;
CREATE VIEW public.orbit_tenant_ops_media_v
WITH (security_invoker = true)
AS
SELECT
  e.id AS empresa_id,
  count(m.id) AS media_count,
  count(m.id) FILTER (WHERE m.deleted_at IS NULL AND m.ativo AND m.aprovado) AS active_count,
  count(m.id) FILTER (WHERE m.deleted_at IS NULL AND NOT m.ativo) AS inactive_count,
  count(m.id) FILTER (WHERE m.deleted_at IS NOT NULL) AS soft_deleted_count,
  count(m.id) FILTER (WHERE m.deleted_at IS NULL AND m.storage_path LIKE 'http%') AS legacy_public_urls,
  coalesce(round((sum(m.size_bytes) FILTER (WHERE m.deleted_at IS NULL))::numeric / 1048576.0, 2), 0) AS total_storage_mb,
  coalesce((
    SELECT jsonb_object_agg(k.kind, k.item_count)
    FROM (
      SELECT ml.kind, count(*) AS item_count
      FROM public.orbit_media_library ml
      WHERE ml.empresa_id=e.id AND ml.deleted_at IS NULL
      GROUP BY ml.kind
    ) k
  ), '{}'::jsonb) AS by_type,
  true AS private_bucket_expected,
  true AS signed_url_enabled
FROM public.orbit_empresas e
LEFT JOIN public.orbit_media_library m ON m.empresa_id = e.id
GROUP BY e.id;

REVOKE ALL ON public.orbit_tenant_ops_media_v FROM PUBLIC, anon;
GRANT SELECT ON public.orbit_tenant_ops_media_v TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orbit_tenant_ops_read(p_section text DEFAULT 'summary'::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_enabled boolean := false;
  v_queue_data jsonb;
  v_ai_handoff_data jsonb;
  v_whatsapp_data jsonb;
  v_agenda_data jsonb;
  v_media_data jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;

  SELECT p.empresa_id INTO v_empresa_id
  FROM public.profiles p
  WHERE p.id = v_uid AND p.ativo = true;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_CONTEXT_MISSING';
  END IF;

  SELECT coalesce(f.enabled, false) INTO v_enabled
  FROM public.orbit_feature_flags f
  WHERE f.empresa_id = v_empresa_id
    AND f.feature_key = 'tenant_operations_center_v1';

  IF NOT coalesce(v_enabled, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_OPERATIONS_FEATURE_DISABLED';
  END IF;

  IF p_section NOT IN ('summary','agenda','whatsapp','ai_handoff','queues','media','alerts','audit','capabilities','health') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SECTION';
  END IF;

  SELECT coalesce((SELECT to_jsonb(q) FROM public.orbit_tenant_ops_queue_v q WHERE q.empresa_id = v_empresa_id),
    jsonb_build_object('pending_count',0,'processing_count',0,'failed_count',0,'pending_over_24h',0,'paused',true))
  INTO v_queue_data;

  SELECT coalesce((SELECT to_jsonb(h) FROM public.orbit_tenant_ops_ai_handoff_v h WHERE h.empresa_id = v_empresa_id),
    jsonb_build_object('ai_active',0,'human_owned',0,'awaiting_human',0,'handoff_sent',0,'possibly_stuck',0))
    || jsonb_build_object(
      'automatic_mode_enabled', coalesce((SELECT a.modo_automatico FROM public.orbit_ai_config a WHERE a.empresa_id=v_empresa_id ORDER BY a.updated_at DESC NULLS LAST LIMIT 1), false),
      'pending_debounce', (SELECT count(*) FROM public.orbit_ai_reply_debounce d WHERE d.empresa_id=v_empresa_id AND d.status='pending')
    )
  INTO v_ai_handoff_data;

  SELECT coalesce((SELECT to_jsonb(w) FROM public.orbit_tenant_ops_whatsapp_v w WHERE w.empresa_id=v_empresa_id),
    jsonb_build_object('configured',false,'ativo',false,'envio_real_liberado',false,'instance_offline',false,'credentials_valid',false))
  INTO v_whatsapp_data;

  SELECT coalesce((SELECT to_jsonb(a) FROM public.orbit_tenant_ops_agenda_v a WHERE a.empresa_id=v_empresa_id),
    jsonb_build_object('connected',false,'timezone','America/Sao_Paulo','availability_start','09:00','availability_end','18:00','booking_min_notice_minutes',60,'booking_max_horizon_days',60,'meeting_duration_default_minutes',60,'token_present',false))
    || jsonb_build_object(
      'exceptions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', x.id, 'exception_date', x.exception_date, 'reason', x.reason,
          'is_available', x.is_available, 'created_at', x.created_at
        ) ORDER BY x.exception_date)
        FROM public.orbit_agenda_date_exceptions x
        WHERE x.empresa_id=v_empresa_id AND x.exception_date >= current_date
      ), '[]'::jsonb)
    )
  INTO v_agenda_data;

  SELECT coalesce((SELECT to_jsonb(m) FROM public.orbit_tenant_ops_media_v m WHERE m.empresa_id=v_empresa_id),
    jsonb_build_object('media_count',0,'active_count',0,'soft_deleted_count',0,'total_storage_mb',0,'by_type','{}'::jsonb))
    || jsonb_build_object(
      'referenced_by_flows', coalesce((
        SELECT sum(public.orbit_media_active_flow_reference_count(ml.empresa_id, ml.id))
        FROM public.orbit_media_library ml WHERE ml.empresa_id=v_empresa_id AND ml.deleted_at IS NULL
      ), 0),
      'items', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ml.id, 'name', ml.nome, 'kind', ml.kind, 'purpose', ml.purpose,
          'mime', ml.mime, 'size_bytes', coalesce(ml.size_bytes,0),
          'active', ml.ativo, 'approved', ml.aprovado, 'deleted_at', ml.deleted_at,
          'active_flow_references', public.orbit_media_active_flow_reference_count(ml.empresa_id, ml.id),
          'created_at', ml.created_at
        ) ORDER BY (ml.deleted_at IS NOT NULL), ml.created_at DESC)
        FROM (SELECT * FROM public.orbit_media_library WHERE empresa_id=v_empresa_id ORDER BY created_at DESC LIMIT 200) ml
      ), '[]'::jsonb)
    )
  INTO v_media_data;

  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
    'tenant_id',v_empresa_id,'section',p_section,'generated_at',now(),'overall_status','healthy',
    'feature_enabled',v_enabled,'queue',v_queue_data,'ai_handoff',v_ai_handoff_data,
    'whatsapp',v_whatsapp_data,'agenda',v_agenda_data,'media',v_media_data
  ));
END;
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_ops_read(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_read(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.orbit_tenant_ops_action(
  p_tenant_slug text,
  p_action_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_empresa_id uuid;
  v_media_id uuid;
  v_affected_rows integer := 0;
  v_step_rows integer := 0;
  v_preview_count integer := 0;
  v_linked_count bigint := 0;
  v_message text;
  v_new_state boolean;
  v_enabled boolean;
  v_is_authorized boolean := false;
  v_timezone text;
  v_pause_start time;
  v_pause_end time;
  v_duration integer;
  v_min_advance integer;
  v_max_horizon integer;
  v_exception_date date;
  v_reason text;
  v_is_available boolean;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='UNAUTHENTICATED'; END IF;
  IF p_tenant_slug IS NULL OR btrim(p_tenant_slug)='' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='TENANT_SLUG_REQUIRED'; END IF;
  IF p_action_type NOT IN (
    'pause_tenant_ai','resume_tenant_ai','retry_failed_queues','clear_pending_queues',
    'toggle_whatsapp_live_send','pause_queue_processing','resume_queue_processing',
    'preview_stale_messages','cancel_stale_messages','update_agenda_config',
    'add_agenda_date_exception','soft_delete_media','restore_soft_deleted_media'
  ) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_ACTION_TYPE'; END IF;

  SELECT e.id INTO v_empresa_id FROM public.orbit_empresas e WHERE e.slug=p_tenant_slug AND e.ativo=true;
  IF v_empresa_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TENANT_NOT_FOUND'; END IF;

  SELECT public.has_role(v_actor_id,'super_admin'::public.app_role)
    OR (public.has_role(v_actor_id,'admin'::public.app_role) AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id=v_actor_id AND p.empresa_id=v_empresa_id AND p.ativo=true
    )) INTO v_is_authorized;
  IF NOT coalesce(v_is_authorized,false) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TENANT_ACTION_FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orbit_feature_flags f WHERE f.empresa_id=v_empresa_id AND f.feature_key='tenant_operations_center_v1' AND f.enabled=true)
    THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TENANT_OPERATIONS_FEATURE_DISABLED'; END IF;

  CASE p_action_type
    WHEN 'pause_tenant_ai' THEN
      UPDATE public.orbit_ai_config SET modo_automatico=false,updated_at=now() WHERE empresa_id=v_empresa_id AND modo_automatico IS DISTINCT FROM false;
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_new_state:=false; v_message:='IA global pausada com sucesso.';
    WHEN 'resume_tenant_ai' THEN
      UPDATE public.orbit_ai_config SET modo_automatico=true,updated_at=now() WHERE empresa_id=v_empresa_id AND modo_automatico IS DISTINCT FROM true;
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_new_state:=true; v_message:='IA global retomada com sucesso.';
    WHEN 'retry_failed_queues' THEN
      SELECT count(*)::integer INTO v_preview_count FROM public.orbit_whatsapp_outbox WHERE empresa_id=v_empresa_id AND status='failed';
      IF v_preview_count>50 AND p_payload->>'confirmation' IS DISTINCT FROM 'CONFIRMAR' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TYPED_CONFIRMATION_REQUIRED';END IF;
      UPDATE public.orbit_whatsapp_outbox SET status='pending',attempts=0,locked_at=NULL,locked_by=NULL,next_attempt_at=now(),last_error=NULL,updated_at=now() WHERE empresa_id=v_empresa_id AND status='failed';
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_message:='Mensagens com falha devolvidas à fila.';
    WHEN 'clear_pending_queues' THEN
      SELECT count(*)::integer INTO v_preview_count FROM public.orbit_whatsapp_outbox WHERE empresa_id=v_empresa_id AND status='pending';
      IF v_preview_count>50 AND p_payload->>'confirmation' IS DISTINCT FROM 'CONFIRMAR' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TYPED_CONFIRMATION_REQUIRED';END IF;
      UPDATE public.orbit_whatsapp_outbox SET status='canceled',canceled_at=now(),canceled_reason='tenant_ops_manual_clear',locked_at=NULL,locked_by=NULL,updated_at=now() WHERE empresa_id=v_empresa_id AND status='pending';
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_message:='Mensagens pendentes canceladas sem exclusão física.';
    WHEN 'toggle_whatsapp_live_send' THEN
      IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ENABLED_BOOLEAN_REQUIRED';END IF;
      v_enabled:=(p_payload->>'enabled')::boolean;
      IF v_enabled AND NOT EXISTS(SELECT 1 FROM public.orbit_zapi_config z WHERE z.empresa_id=v_empresa_id AND nullif(btrim(z.instance_id),'') IS NOT NULL AND(z.token_secret_id IS NOT NULL OR nullif(btrim(z.token),'') IS NOT NULL) AND(z.client_token_secret_id IS NOT NULL OR nullif(btrim(z.client_token),'') IS NOT NULL)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WHATSAPP_CREDENTIALS_INVALID';END IF;
      UPDATE public.orbit_zapi_config SET envio_real_liberado=v_enabled,updated_at=now() WHERE empresa_id=v_empresa_id AND envio_real_liberado IS DISTINCT FROM v_enabled;
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_new_state:=v_enabled; v_message:=CASE WHEN v_enabled THEN 'Envio real do WhatsApp ativado.' ELSE 'Envio real do WhatsApp pausado.' END;
    WHEN 'pause_queue_processing' THEN
      INSERT INTO public.orbit_whatsapp_sending_config(empresa_id,enabled,updated_at) VALUES(v_empresa_id,false,now()) ON CONFLICT(empresa_id) DO UPDATE SET enabled=false,updated_at=now();
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_new_state:=false; v_message:='Consumo da fila pausado.';
    WHEN 'resume_queue_processing' THEN
      INSERT INTO public.orbit_whatsapp_sending_config(empresa_id,enabled,updated_at) VALUES(v_empresa_id,true,now()) ON CONFLICT(empresa_id) DO UPDATE SET enabled=true,updated_at=now();
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_new_state:=true; v_message:='Consumo da fila retomado.';
    WHEN 'preview_stale_messages' THEN
      SELECT count(*)::integer INTO v_preview_count FROM public.orbit_whatsapp_outbox WHERE empresa_id=v_empresa_id AND status='pending' AND created_at<now()-interval '24 hours';
      v_message:='Prévia do backlog antigo calculada.';
    WHEN 'cancel_stale_messages' THEN
      SELECT count(*)::integer INTO v_preview_count FROM public.orbit_whatsapp_outbox WHERE empresa_id=v_empresa_id AND status='pending' AND created_at<now()-interval '24 hours';
      IF v_preview_count>50 AND p_payload->>'confirmation' IS DISTINCT FROM 'CONFIRMAR' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TYPED_CONFIRMATION_REQUIRED';END IF;
      UPDATE public.orbit_whatsapp_outbox SET status='stale_canceled',canceled_at=now(),canceled_reason='tenant_ops_stale_over_24h',locked_at=NULL,locked_by=NULL,updated_at=now() WHERE empresa_id=v_empresa_id AND status='pending' AND created_at<now()-interval '24 hours';
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_message:='Backlog antigo marcado como stale_canceled.';
    WHEN 'update_agenda_config' THEN
      v_timezone:=nullif(btrim(p_payload->>'timezone'),'');
      IF v_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_timezone) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TIMEZONE';END IF;
      IF p_payload->>'daily_pause_start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR p_payload->>'daily_pause_end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DAILY_PAUSE';END IF;
      v_pause_start:=(p_payload->>'daily_pause_start')::time; v_pause_end:=(p_payload->>'daily_pause_end')::time;
      IF v_pause_start>=v_pause_end THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DAILY_PAUSE_WINDOW';END IF;
      IF p_payload->>'default_meeting_duration' !~ '^\d+$' OR p_payload->>'min_advance_minutes' !~ '^\d+$' OR p_payload->>'max_horizon_days' !~ '^\d+$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_AGENDA_NUMERIC_CONFIG';END IF;
      v_duration:=(p_payload->>'default_meeting_duration')::integer; v_min_advance:=(p_payload->>'min_advance_minutes')::integer; v_max_horizon:=(p_payload->>'max_horizon_days')::integer;
      IF v_duration<5 OR v_duration>480 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MEETING_DURATION';END IF;
      IF v_min_advance<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MIN_ADVANCE';END IF;
      IF v_max_horizon<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MAX_HORIZON';END IF;
      UPDATE public.orbit_google_tokens SET timezone=v_timezone,availability_break_start=v_pause_start,availability_break_end=v_pause_end,booking_min_notice_minutes=v_min_advance,booking_max_horizon_days=v_max_horizon,updated_at=now() WHERE empresa_id=v_empresa_id;
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT;
      IF v_affected_rows=0 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AGENDA_NOT_CONNECTED';END IF;
      UPDATE public.orbit_ai_config SET scheduling_meeting_duration_minutes=v_duration,updated_at=now() WHERE empresa_id=v_empresa_id;
      GET DIAGNOSTICS v_step_rows=ROW_COUNT; v_affected_rows:=v_affected_rows+v_step_rows; v_message:='Parâmetros da agenda atualizados.';
    WHEN 'add_agenda_date_exception' THEN
      IF p_payload->>'exception_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_EXCEPTION_DATE';END IF;
      v_exception_date:=(p_payload->>'exception_date')::date; v_reason:=nullif(btrim(p_payload->>'reason'),'');
      IF v_reason IS NULL OR length(v_reason)>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_EXCEPTION_REASON';END IF;
      IF jsonb_typeof(p_payload->'is_available') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IS_AVAILABLE_BOOLEAN_REQUIRED';END IF;
      v_is_available:=(p_payload->>'is_available')::boolean;
      INSERT INTO public.orbit_agenda_date_exceptions(empresa_id,exception_date,reason,is_available,created_by,updated_at)
      VALUES(v_empresa_id,v_exception_date,v_reason,v_is_available,v_actor_id,now())
      ON CONFLICT(empresa_id,exception_date) DO UPDATE SET reason=excluded.reason,is_available=excluded.is_available,updated_at=now();
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_message:='Exceção de data salva.';
    WHEN 'soft_delete_media' THEN
      IF p_payload->>'media_id' !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MEDIA_ID';END IF;
      v_media_id:=(p_payload->>'media_id')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.orbit_media_library m WHERE m.id=v_media_id AND m.empresa_id=v_empresa_id) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='MEDIA_NOT_FOUND';END IF;
      SELECT public.orbit_media_active_flow_reference_count(v_empresa_id,v_media_id) INTO v_linked_count;
      IF v_linked_count>0 THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='MEDIA_LINKED_TO_ACTIVE_FLOW';END IF;
      UPDATE public.orbit_media_library SET deleted_at=now(),deleted_by=v_actor_id,ativo=false,updated_at=now() WHERE id=v_media_id AND empresa_id=v_empresa_id AND deleted_at IS NULL;
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT; v_message:='Mídia movida para a lixeira com segurança.';
    WHEN 'restore_soft_deleted_media' THEN
      IF p_payload->>'media_id' !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MEDIA_ID';END IF;
      v_media_id:=(p_payload->>'media_id')::uuid;
      UPDATE public.orbit_media_library SET deleted_at=NULL,deleted_by=NULL,ativo=true,updated_at=now() WHERE id=v_media_id AND empresa_id=v_empresa_id AND deleted_at IS NOT NULL;
      GET DIAGNOSTICS v_affected_rows=ROW_COUNT;
      IF v_affected_rows=0 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='SOFT_DELETED_MEDIA_NOT_FOUND';END IF;
      v_message:='Mídia restaurada.';
  END CASE;

  INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_empresa_id,v_actor_id,p_action_type,
    CASE WHEN p_action_type LIKE '%media%' THEN 'orbit_media_library' WHEN p_action_type LIKE '%agenda%' THEN 'orbit_agenda' ELSE 'tenant_operations' END,
    coalesce(v_media_id,v_empresa_id),jsonb_build_object('tenant_slug',p_tenant_slug,'affected_rows',v_affected_rows,'preview_count',v_preview_count,'linked_count',v_linked_count,'new_state',v_new_state,'payload',coalesce(p_payload,'{}'::jsonb),'source','tenant_operations_center_v3'));

  RETURN jsonb_strip_nulls(jsonb_build_object('ok',true,'action',p_action_type,'affected_rows',v_affected_rows,'preview_count',v_preview_count,'linked_count',v_linked_count,'entity_id',v_media_id,'new_state',v_new_state,'message',v_message));
END;
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_action(text,text,jsonb) TO authenticated;
