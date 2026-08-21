-- Wave 3.3b: explicit tenant context for Z-API and WhatsApp sending config.
BEGIN;

DO $rollout_guard$
DECLARE v_invalid text[];
BEGIN
  SELECT array_agg(x.slug ORDER BY x.slug) INTO v_invalid
  FROM (VALUES ('fluxrow',true),('bullink-negocios',false),
               ('fabrica-de-pesquisadores',false),('viver-semijoias',false)) x(slug,enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug=x.slug
  LEFT JOIN public.orbit_feature_flags f ON f.empresa_id=e.id
    AND f.feature_key='tenant_config_governance_wave3_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM x.enabled;
  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_CONFIG_GOVERNANCE_ROLLOUT_MISMATCH: %',v_invalid;
  END IF;
END $rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_delivery_config_read_scoped(
  p_tenant_slug text,
  p_config_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_data jsonb;
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug, 'tenant_config_governance_wave3_v1'
  );

  IF p_config_type = 'zapi' THEN
    v_data := public.get_orbit_zapi_config_public(v_empresa_id);
  ELSIF p_config_type = 'whatsapp_sending' THEN
    SELECT to_jsonb(c) INTO v_data
    FROM public.orbit_whatsapp_sending_config c
    WHERE c.empresa_id = v_empresa_id;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CONFIG_TYPE_NOT_SUPPORTED';
  END IF;

  RETURN jsonb_build_object('ok',true,'config_type',p_config_type,'data',v_data);
END
$function$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_delivery_config_mutate_scoped(
  p_tenant_slug text,
  p_config_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_is_admin boolean;
  v_allowed text[];
  v_sensitive text[] := ARRAY[]::text[];
  v_current jsonb;
  v_data jsonb;
  v_id uuid;
  v_min_delay int;
  v_max_delay int;
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug, 'tenant_config_governance_wave3_v1'
  );

  SELECT public.has_role(v_uid,'super_admin'::public.app_role)
      OR public.pe_is_super_admin(v_uid)
      OR EXISTS (SELECT 1 FROM public.user_empresa_memberships m
                 WHERE m.user_id=v_uid AND m.empresa_id=v_empresa_id AND m.role='admin')
      OR EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id=v_uid AND p.empresa_id=v_empresa_id AND p.ativo=true
                   AND public.pe_user_is_orbit_admin(v_uid))
  INTO v_is_admin;
  IF NOT coalesce(v_is_admin,false) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_ADMIN_REQUIRED';
  END IF;
  IF jsonb_typeof(coalesce(p_payload,'{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CONFIG_PAYLOAD';
  END IF;

  IF p_config_type='zapi' THEN
    v_allowed := ARRAY['nome_instancia','instance_id','token','client_token',
      'numero_origem','webhook_url','notificar_enviadas_por_mim','ativo'];
    v_sensitive := ARRAY['token','client_token'];
  ELSIF p_config_type='whatsapp_sending' THEN
    v_allowed := ARRAY['min_delay_ms','max_delay_ms','batch_size','batch_pause_ms',
      'daily_limit','max_per_minute','warmup_enabled','warmup_start_date','enabled',
      'outbox_adapter_enabled'];
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CONFIG_TYPE_NOT_SUPPORTED';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(v_allowed)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PAYLOAD_FIELD_NOT_ALLOWED';
  END IF;

  IF p_config_type='zapi' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_empresa_id::text,2));
    v_current := coalesce(public.get_orbit_zapi_config_public(v_empresa_id),'{}'::jsonb);
    v_data := public.upsert_orbit_zapi_config_secure(
      v_empresa_id,
      coalesce(p_payload->>'nome_instancia',v_current->>'nome_instancia'),
      coalesce(p_payload->>'instance_id',v_current->>'instance_id'),
      nullif(p_payload->>'token',''),
      nullif(p_payload->>'client_token',''),
      coalesce(p_payload->>'numero_origem',v_current->>'numero_origem'),
      coalesce(p_payload->>'webhook_url',v_current->>'webhook_url'),
      coalesce((p_payload->>'notificar_enviadas_por_mim')::boolean,
               (v_current->>'notificar_enviadas_por_mim')::boolean,false),
      coalesce((p_payload->>'ativo')::boolean,(v_current->>'ativo')::boolean,false)
    );
    v_id := nullif(v_data->>'id','')::uuid;
  ELSE
    INSERT INTO public.orbit_whatsapp_sending_config (empresa_id)
    VALUES (v_empresa_id)
    ON CONFLICT (empresa_id) DO NOTHING;
    SELECT to_jsonb(c) INTO v_current
    FROM public.orbit_whatsapp_sending_config c
    WHERE c.empresa_id=v_empresa_id FOR UPDATE;

    v_min_delay := coalesce((p_payload->>'min_delay_ms')::int,
                            (v_current->>'min_delay_ms')::int);
    v_max_delay := coalesce((p_payload->>'max_delay_ms')::int,
                            (v_current->>'max_delay_ms')::int);
    IF v_min_delay NOT BETWEEN 0 AND 300000 OR v_max_delay NOT BETWEEN v_min_delay AND 300000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEND_DELAY_RANGE';
    END IF;
    IF p_payload ? 'batch_size' AND (p_payload->>'batch_size')::int NOT BETWEEN 1 AND 1000
      OR p_payload ? 'batch_pause_ms' AND (p_payload->>'batch_pause_ms')::int NOT BETWEEN 0 AND 3600000
      OR p_payload ? 'daily_limit' AND (p_payload->>'daily_limit')::int NOT BETWEEN 1 AND 100000
      OR p_payload ? 'max_per_minute' AND (p_payload->>'max_per_minute')::int NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEND_LIMIT';
    END IF;

    UPDATE public.orbit_whatsapp_sending_config c SET
      min_delay_ms=coalesce((p_payload->>'min_delay_ms')::int,c.min_delay_ms),
      max_delay_ms=coalesce((p_payload->>'max_delay_ms')::int,c.max_delay_ms),
      batch_size=coalesce((p_payload->>'batch_size')::int,c.batch_size),
      batch_pause_ms=coalesce((p_payload->>'batch_pause_ms')::int,c.batch_pause_ms),
      daily_limit=coalesce((p_payload->>'daily_limit')::int,c.daily_limit),
      max_per_minute=coalesce((p_payload->>'max_per_minute')::int,c.max_per_minute),
      warmup_enabled=coalesce((p_payload->>'warmup_enabled')::boolean,c.warmup_enabled),
      warmup_start_date=CASE WHEN p_payload ? 'warmup_start_date'
        THEN nullif(p_payload->>'warmup_start_date','')::date ELSE c.warmup_start_date END,
      enabled=coalesce((p_payload->>'enabled')::boolean,c.enabled),
      outbox_adapter_enabled=coalesce((p_payload->>'outbox_adapter_enabled')::boolean,c.outbox_adapter_enabled),
      updated_at=now()
    WHERE c.empresa_id=v_empresa_id
    RETURNING c.id,to_jsonb(c) INTO v_id,v_data;
  END IF;

  INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes)
  VALUES (v_empresa_id,v_uid,'update_'||p_config_type||'_config',
    CASE WHEN p_config_type='zapi' THEN 'orbit_zapi_config'
         ELSE 'orbit_whatsapp_sending_config' END,
    v_id,jsonb_build_object(
      'source','tenant_config_governance_wave3_v1',
      'fields_changed',(SELECT coalesce(jsonb_agg(k ORDER BY k),'[]'::jsonb)
                        FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(v_sensitive)),
      'secret_changed',EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k=ANY(v_sensitive))
    ));

  RETURN jsonb_build_object('ok',true,'config_type',p_config_type,'data',v_data);
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_delivery_config_read_scoped(text,text)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.orbit_tenant_delivery_config_mutate_scoped(text,text,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_delivery_config_read_scoped(text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_delivery_config_mutate_scoped(text,text,jsonb)
  TO authenticated;

-- No anonymous policy exists; public sends use service-role runtimes.
REVOKE ALL ON TABLE public.orbit_whatsapp_sending_config FROM anon;
REVOKE TRUNCATE,TRIGGER,REFERENCES ON TABLE
  public.orbit_zapi_config,public.orbit_whatsapp_sending_config
FROM authenticated;

-- For the canary, the SECURITY DEFINER RPC is the only write path. For tenants
-- whose flag is false these restrictive policies evaluate true and preserve
-- the legacy policies unchanged.
ALTER TABLE public.orbit_zapi_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_whatsapp_sending_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_config_wave3_zapi_insert_guard ON public.orbit_zapi_config;
CREATE POLICY tenant_config_wave3_zapi_insert_guard
ON public.orbit_zapi_config AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));
DROP POLICY IF EXISTS tenant_config_wave3_zapi_update_guard ON public.orbit_zapi_config;
CREATE POLICY tenant_config_wave3_zapi_update_guard
ON public.orbit_zapi_config AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id))
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));
DROP POLICY IF EXISTS tenant_config_wave3_zapi_delete_guard ON public.orbit_zapi_config;
CREATE POLICY tenant_config_wave3_zapi_delete_guard
ON public.orbit_zapi_config AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

DROP POLICY IF EXISTS tenant_config_wave3_sending_insert_guard ON public.orbit_whatsapp_sending_config;
CREATE POLICY tenant_config_wave3_sending_insert_guard
ON public.orbit_whatsapp_sending_config AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));
DROP POLICY IF EXISTS tenant_config_wave3_sending_update_guard ON public.orbit_whatsapp_sending_config;
CREATE POLICY tenant_config_wave3_sending_update_guard
ON public.orbit_whatsapp_sending_config AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id))
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));
DROP POLICY IF EXISTS tenant_config_wave3_sending_delete_guard ON public.orbit_whatsapp_sending_config;
CREATE POLICY tenant_config_wave3_sending_delete_guard
ON public.orbit_whatsapp_sending_config AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

COMMIT;
