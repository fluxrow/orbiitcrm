-- Fase 4: governanca, suporte JIT, alertas e retencao.

CREATE TABLE public.orbit_support_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL REFERENCES auth.users(id),
  tenant_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT orbit_support_session_max_duration CHECK (expires_at > started_at AND expires_at <= started_at + interval '60 minutes')
);
CREATE UNIQUE INDEX orbit_support_sessions_one_active_actor_idx ON public.orbit_support_sessions(super_admin_id) WHERE revoked_at IS NULL;
CREATE INDEX orbit_support_sessions_tenant_started_idx ON public.orbit_support_sessions(tenant_id, started_at DESC);
ALTER TABLE public.orbit_support_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY orbit_support_sessions_super_admin_read ON public.orbit_support_sessions FOR SELECT TO authenticated
USING (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));
REVOKE ALL ON public.orbit_support_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orbit_support_sessions TO authenticated;
GRANT ALL ON public.orbit_support_sessions TO service_role;

CREATE TABLE public.orbit_tenant_alert_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  operational_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  fallback_email text NOT NULL DEFAULT 'fbcfarias@icloud.com',
  email_enabled boolean NOT NULL DEFAULT true,
  queue_warning_threshold integer NOT NULL DEFAULT 25 CHECK (queue_warning_threshold >= 0),
  queue_critical_threshold integer NOT NULL DEFAULT 100 CHECK (queue_critical_threshold >= queue_warning_threshold),
  instance_offline_minutes integer NOT NULL DEFAULT 5 CHECK (instance_offline_minutes BETWEEN 1 AND 1440),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orbit_tenant_alert_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY orbit_tenant_alert_config_read ON public.orbit_tenant_alert_config FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.ativo=true)
);
REVOKE ALL ON public.orbit_tenant_alert_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orbit_tenant_alert_config TO authenticated;
GRANT ALL ON public.orbit_tenant_alert_config TO service_role;

INSERT INTO public.orbit_tenant_alert_config(empresa_id)
SELECT id FROM public.orbit_empresas ON CONFLICT (empresa_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orbit_is_master_super_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(p_user_id,'super_admin'::public.app_role)
    AND lower(coalesce((SELECT email FROM auth.users WHERE id=p_user_id),''))='fbcfarias@icloud.com'
$$;
REVOKE ALL ON FUNCTION public.orbit_is_master_super_admin(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.orbit_attach_jit_audit_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session public.orbit_support_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.orbit_support_sessions s
   WHERE s.super_admin_id=auth.uid() AND s.tenant_id=NEW.empresa_id
     AND s.revoked_at IS NULL AND s.expires_at>now()
   ORDER BY s.started_at DESC LIMIT 1;
  IF FOUND THEN
    NEW.detalhes=coalesce(NEW.detalhes,'{}'::jsonb)||jsonb_build_object('support_jit',jsonb_build_object(
      'session_id',v_session.session_id,'super_admin_id',v_session.super_admin_id,
      'reason',v_session.reason,'started_at',v_session.started_at,'expires_at',v_session.expires_at));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orbit_audit_attach_jit ON public.orbit_audit_log;
CREATE TRIGGER orbit_audit_attach_jit BEFORE INSERT ON public.orbit_audit_log
FOR EACH ROW EXECUTE FUNCTION public.orbit_attach_jit_audit_metadata();
REVOKE ALL ON FUNCTION public.orbit_attach_jit_audit_metadata() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.orbit_start_jit_support_session(p_tenant_slug text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_tenant uuid;v_session public.orbit_support_sessions%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='UNAUTHENTICATED';END IF;
  IF NOT public.orbit_is_master_super_admin(v_actor) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MASTER_SUPER_ADMIN_REQUIRED';END IF;
  IF length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SUPPORT_REASON_REQUIRED_MIN_10';END IF;
  SELECT id INTO v_tenant FROM public.orbit_empresas WHERE slug=p_tenant_slug AND ativo=true;
  IF v_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='TENANT_NOT_FOUND';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orbit_feature_flags WHERE empresa_id=v_tenant AND feature_key='tenant_operations_center_v1' AND enabled=true)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_OPERATIONS_FEATURE_DISABLED';END IF;
  UPDATE public.orbit_support_sessions SET revoked_at=now() WHERE super_admin_id=v_actor AND revoked_at IS NULL;
  INSERT INTO public.orbit_support_sessions(super_admin_id,tenant_id,reason,expires_at)
  VALUES(v_actor,v_tenant,btrim(p_reason),now()+interval '60 minutes') RETURNING * INTO v_session;
  INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_tenant,v_actor,'start_jit_support_session','orbit_support_sessions',v_session.session_id,
    jsonb_build_object('reason',v_session.reason,'expires_at',v_session.expires_at,'source','tenant_operations_center_v4'));
  RETURN jsonb_build_object('ok',true,'session_id',v_session.session_id,'reason',v_session.reason,'started_at',v_session.started_at,'expires_at',v_session.expires_at,'tenant_id',v_tenant);
END $$;

CREATE OR REPLACE FUNCTION public.orbit_end_jit_support_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_session public.orbit_support_sessions%ROWTYPE;
BEGIN
  IF NOT public.orbit_is_master_super_admin(v_actor) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MASTER_SUPER_ADMIN_REQUIRED';END IF;
  UPDATE public.orbit_support_sessions SET revoked_at=now()
   WHERE session_id=p_session_id AND super_admin_id=v_actor AND revoked_at IS NULL RETURNING * INTO v_session;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='ACTIVE_SUPPORT_SESSION_NOT_FOUND';END IF;
  INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_session.tenant_id,v_actor,'end_jit_support_session','orbit_support_sessions',v_session.session_id,
    jsonb_build_object('support_jit',jsonb_build_object('session_id',v_session.session_id,'reason',v_session.reason,'started_at',v_session.started_at,'expires_at',v_session.expires_at),'revoked_at',v_session.revoked_at,'source','tenant_operations_center_v4'));
  RETURN jsonb_build_object('ok',true,'session_id',v_session.session_id,'revoked_at',v_session.revoked_at);
END $$;

CREATE OR REPLACE FUNCTION public.orbit_get_active_jit_support_session(p_tenant_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_tenant uuid;v_session public.orbit_support_sessions%ROWTYPE;
BEGIN
 IF NOT public.orbit_is_master_super_admin(v_actor) THEN RETURN jsonb_build_object('ok',true,'active',false,'is_master_super_admin',false);END IF;
 SELECT id INTO v_tenant FROM public.orbit_empresas WHERE slug=p_tenant_slug AND ativo=true;
 SELECT * INTO v_session FROM public.orbit_support_sessions WHERE super_admin_id=v_actor AND tenant_id=v_tenant AND revoked_at IS NULL AND expires_at>now() ORDER BY started_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'active',false,'is_master_super_admin',true);END IF;
 RETURN jsonb_build_object('ok',true,'active',true,'is_master_super_admin',true,'session_id',v_session.session_id,'reason',v_session.reason,'started_at',v_session.started_at,'expires_at',v_session.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.orbit_sanitize_audit_json(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE v_result jsonb:='{}'::jsonb;v_key text;v_item jsonb;
BEGIN
 IF p_value IS NULL THEN RETURN '{}'::jsonb;END IF;
 IF jsonb_typeof(p_value)='array' THEN SELECT coalesce(jsonb_agg(public.orbit_sanitize_audit_json(value)),'[]'::jsonb) INTO v_result FROM jsonb_array_elements(p_value);RETURN v_result;END IF;
 IF jsonb_typeof(p_value)<>'object' THEN RETURN p_value;END IF;
 FOR v_key,v_item IN SELECT key,value FROM jsonb_each(p_value) LOOP
   IF lower(v_key) ~ '(token|secret|password|authorization|client_token|access_token|refresh_token)' THEN v_result:=v_result||jsonb_build_object(v_key,'[REDACTED]');
   ELSIF lower(v_key) ~ '(phone|telefone|email|cpf|cnpj|ip_address)' THEN v_result:=v_result||jsonb_build_object(v_key,'[MASKED]');
   ELSE v_result:=v_result||jsonb_build_object(v_key,public.orbit_sanitize_audit_json(v_item));END IF;
 END LOOP;RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.orbit_sanitize_audit_json(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.orbit_get_tenant_audit_logs(p_tenant_slug text,p_action_filter text DEFAULT NULL,p_limit int DEFAULT 50,p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_tenant uuid;v_total bigint;v_items jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='UNAUTHENTICATED';END IF;
 SELECT id INTO v_tenant FROM public.orbit_empresas WHERE slug=p_tenant_slug AND ativo=true;
 IF v_tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='TENANT_NOT_FOUND';END IF;
 IF NOT (public.has_role(v_actor,'super_admin'::public.app_role) OR (public.has_role(v_actor,'admin'::public.app_role) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.empresa_id=v_tenant AND p.ativo=true))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_ADMIN_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orbit_feature_flags WHERE empresa_id=v_tenant AND feature_key='tenant_operations_center_v1' AND enabled=true) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_OPERATIONS_FEATURE_DISABLED';END IF;
 p_limit:=least(greatest(coalesce(p_limit,50),1),200);p_offset:=greatest(coalesce(p_offset,0),0);
 SELECT count(*) INTO v_total FROM public.orbit_audit_log a WHERE a.empresa_id=v_tenant AND (nullif(btrim(p_action_filter),'') IS NULL OR a.acao ILIKE '%'||btrim(p_action_filter)||'%');
 SELECT coalesce(jsonb_agg(x.row_data ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_items FROM (
   SELECT a.created_at,jsonb_build_object('id',a.id,'occurred_at',a.created_at,'actor_id',a.user_id,'actor_display_name',coalesce(p.nome,'Sistema'),'actor_type',CASE WHEN a.detalhes ? 'support_jit' THEN 'support_jit' WHEN a.user_id IS NULL THEN 'system' ELSE 'user' END,'action',a.acao,'resource_type',a.entidade,'resource_id',a.entidade_id,'result',coalesce(a.detalhes->>'result','success'),'reason',coalesce(a.detalhes->>'reason',a.detalhes#>>'{support_jit,reason}'),'details',public.orbit_sanitize_audit_json(a.detalhes)) row_data
   FROM public.orbit_audit_log a LEFT JOIN public.profiles p ON p.id=a.user_id WHERE a.empresa_id=v_tenant AND (nullif(btrim(p_action_filter),'') IS NULL OR a.acao ILIKE '%'||btrim(p_action_filter)||'%') ORDER BY a.created_at DESC LIMIT p_limit OFFSET p_offset
 ) x;
 RETURN jsonb_build_object('ok',true,'items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset,'has_more',p_offset+p_limit<v_total,'retention_days',365,'sanitized',true);
END $$;

CREATE OR REPLACE FUNCTION public.orbit_get_tenant_alert_config(p_tenant_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_tenant uuid;v_cfg public.orbit_tenant_alert_config%ROWTYPE;
BEGIN
 SELECT id INTO v_tenant FROM public.orbit_empresas WHERE slug=p_tenant_slug AND ativo=true;
 IF NOT (public.has_role(v_actor,'super_admin'::public.app_role) OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.empresa_id=v_tenant AND p.ativo=true)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_ACCESS_DENIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orbit_feature_flags WHERE empresa_id=v_tenant AND feature_key='tenant_operations_center_v1' AND enabled=true) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_OPERATIONS_FEATURE_DISABLED';END IF;
 SELECT * INTO v_cfg FROM public.orbit_tenant_alert_config WHERE empresa_id=v_tenant;
 RETURN jsonb_build_object('ok',true,'operational_emails',v_cfg.operational_emails,'fallback_email',v_cfg.fallback_email,'email_enabled',v_cfg.email_enabled,'queue_warning_threshold',v_cfg.queue_warning_threshold,'queue_critical_threshold',v_cfg.queue_critical_threshold,'instance_offline_minutes',v_cfg.instance_offline_minutes,'updated_at',v_cfg.updated_at);
END $$;

ALTER FUNCTION public.orbit_tenant_ops_action(text,text,jsonb) RENAME TO orbit_tenant_ops_action_phase3_part2;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action_phase3_part2(text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.orbit_tenant_ops_action(p_tenant_slug text,p_action_type text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_tenant uuid;v_before jsonb;v_after jsonb;v_emails text[];v_count int;
BEGIN
 IF p_action_type<>'update_tenant_alert_config' THEN RETURN public.orbit_tenant_ops_action_phase3_part2(p_tenant_slug,p_action_type,p_payload);END IF;
 SELECT id INTO v_tenant FROM public.orbit_empresas WHERE slug=p_tenant_slug AND ativo=true;
 IF NOT (public.has_role(v_actor,'super_admin'::public.app_role) OR (public.has_role(v_actor,'admin'::public.app_role) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.empresa_id=v_tenant AND p.ativo=true))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_ADMIN_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orbit_feature_flags WHERE empresa_id=v_tenant AND feature_key='tenant_operations_center_v1' AND enabled=true) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_OPERATIONS_FEATURE_DISABLED';END IF;
 SELECT coalesce(array_agg(lower(btrim(value))) FILTER(WHERE btrim(value)~*'^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),ARRAY[]::text[]) INTO v_emails FROM jsonb_array_elements_text(coalesce(p_payload->'operational_emails','[]'::jsonb));
 IF jsonb_array_length(coalesce(p_payload->'operational_emails','[]'::jsonb))<>cardinality(v_emails) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_OPERATIONAL_EMAIL';END IF;
 SELECT to_jsonb(c) INTO v_before FROM public.orbit_tenant_alert_config c WHERE empresa_id=v_tenant FOR UPDATE;
 INSERT INTO public.orbit_tenant_alert_config(empresa_id,operational_emails,email_enabled,queue_warning_threshold,queue_critical_threshold,instance_offline_minutes,updated_by,updated_at)
 VALUES(v_tenant,v_emails,coalesce((p_payload->>'email_enabled')::boolean,true),coalesce((p_payload->>'queue_warning_threshold')::int,25),coalesce((p_payload->>'queue_critical_threshold')::int,100),coalesce((p_payload->>'instance_offline_minutes')::int,5),v_actor,now())
 ON CONFLICT(empresa_id) DO UPDATE SET operational_emails=excluded.operational_emails,email_enabled=excluded.email_enabled,queue_warning_threshold=excluded.queue_warning_threshold,queue_critical_threshold=excluded.queue_critical_threshold,instance_offline_minutes=excluded.instance_offline_minutes,updated_by=v_actor,updated_at=now();
 GET DIAGNOSTICS v_count=ROW_COUNT;SELECT to_jsonb(c) INTO v_after FROM public.orbit_tenant_alert_config c WHERE empresa_id=v_tenant;
 INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes) VALUES(v_tenant,v_actor,p_action_type,'orbit_tenant_alert_config',v_tenant,jsonb_build_object('payload',p_payload,'diff',jsonb_build_object('before',v_before,'after',v_after),'source','tenant_operations_center_v4'));
 RETURN jsonb_build_object('ok',true,'action',p_action_type,'affected_rows',v_count,'message','Configuração de alertas atualizada.');
END $$;

CREATE OR REPLACE FUNCTION public.orbit_apply_log_retention()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_webhooks int;v_email int;v_flow int;v_zapi int;v_audit int;
BEGIN
 DELETE FROM public.orbit_webhook_logs WHERE created_at<now()-interval '90 days';GET DIAGNOSTICS v_webhooks=ROW_COUNT;
 DELETE FROM public.orbit_email_events WHERE created_at<now()-interval '90 days';GET DIAGNOSTICS v_email=ROW_COUNT;
 DELETE FROM public.orbit_flow_events WHERE created_at<now()-interval '90 days';GET DIAGNOSTICS v_flow=ROW_COUNT;
 DELETE FROM public.orbit_zapi_status_events WHERE created_at<now()-interval '90 days';GET DIAGNOSTICS v_zapi=ROW_COUNT;
 DELETE FROM public.orbit_audit_log WHERE created_at<now()-interval '365 days';GET DIAGNOSTICS v_audit=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'raw_90_days',jsonb_build_object('webhooks',v_webhooks,'email_events',v_email,'flow_events',v_flow,'zapi_events',v_zapi),'admin_365_days',v_audit,'executed_at',now());
END $$;

REVOKE ALL ON FUNCTION public.orbit_start_jit_support_session(text,text),public.orbit_end_jit_support_session(uuid),public.orbit_get_active_jit_support_session(text),public.orbit_get_tenant_audit_logs(text,text,int,int),public.orbit_get_tenant_alert_config(text),public.orbit_tenant_ops_action(text,text,jsonb),public.orbit_apply_log_retention() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_start_jit_support_session(text,text),public.orbit_end_jit_support_session(uuid),public.orbit_get_active_jit_support_session(text),public.orbit_get_tenant_audit_logs(text,text,int,int),public.orbit_get_tenant_alert_config(text),public.orbit_tenant_ops_action(text,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.orbit_apply_log_retention() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_apply_log_retention() TO service_role;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
   IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='orbit-log-retention-daily') THEN PERFORM cron.unschedule('orbit-log-retention-daily');END IF;
   PERFORM cron.schedule('orbit-log-retention-daily','17 3 * * *',$job$SELECT public.orbit_apply_log_retention();$job$);
 END IF;
END $$;

COMMENT ON FUNCTION public.orbit_apply_log_retention() IS 'Daily segmented retention: raw operational logs 90 days, administrative audit 365 days.';
