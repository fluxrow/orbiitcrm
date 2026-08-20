-- Wave 3.3a: tenant-scoped AI and Resend configuration governance.
BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT e.id, 'tenant_config_governance_wave3_v1', e.slug = 'fluxrow',
       CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
       jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '3.3a')
FROM public.orbit_empresas e
WHERE e.slug IN ('fluxrow','bullink-negocios','fabrica-de-pesquisadores','viver-semijoias')
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.orbit_tenant_config_mutate_scoped(
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
  v_key text;
  v_sql text;
  v_type text;
  v_allowed text[];
  v_sensitive text[];
  v_safe jsonb;
  v_id uuid;
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

  IF p_config_type='ai' THEN
    v_allowed := ARRAY['tom_conversa','modo_automatico','responder_fora_horario',
      'horario_inicio','horario_fim','mensagem_boas_vindas','mensagem_fora_horario',
      'idioma','max_tokens','tempo_espera','tts_ativo','tts_provider','tts_voice_id',
      'tts_modo','tts_api_key','prompt_identidade','prompt_roteiro','prompt_regras',
      'campos_qualificacao','knowledge_base_enabled','modelo_ia'];
    v_sensitive := ARRAY['tts_api_key'];
    -- Production drift: do not assume a unique constraint on empresa_id.
    -- Serialize config creation per tenant before the existence check.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_empresa_id::text,0));
    INSERT INTO public.orbit_ai_config (empresa_id)
    SELECT v_empresa_id WHERE NOT EXISTS (
      SELECT 1 FROM public.orbit_ai_config WHERE empresa_id=v_empresa_id
    );
    SELECT id INTO v_id FROM public.orbit_ai_config WHERE empresa_id=v_empresa_id FOR UPDATE;
  ELSIF p_config_type='resend' THEN
    v_allowed := ARRAY['from_email','from_name','ativo','api_key','dominio_verificado',
                       'email_teste','reply_to_email'];
    v_sensitive := ARRAY['api_key'];
    PERFORM pg_advisory_xact_lock(hashtextextended(v_empresa_id::text,1));
    INSERT INTO public.orbit_resend_config (empresa_id)
    SELECT v_empresa_id WHERE NOT EXISTS (
      SELECT 1 FROM public.orbit_resend_config WHERE empresa_id=v_empresa_id
    );
    SELECT id INTO v_id FROM public.orbit_resend_config WHERE empresa_id=v_empresa_id
      ORDER BY created_at NULLS LAST LIMIT 1 FOR UPDATE;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CONFIG_TYPE_NOT_SUPPORTED';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(v_allowed)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PAYLOAD_FIELD_NOT_ALLOWED';
  END IF;

  IF p_config_type='ai' THEN
    IF p_payload ? 'max_tokens' AND (p_payload->>'max_tokens')::int NOT BETWEEN 1 AND 32000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MAX_TOKENS';
    END IF;
    IF p_payload ? 'tempo_espera' AND (p_payload->>'tempo_espera')::int NOT BETWEEN 0 AND 3600 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_WAIT_SECONDS';
    END IF;
    IF p_payload ? 'tts_modo' AND p_payload->>'tts_modo' NOT IN ('texto','audio','ambos') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TTS_MODE';
    END IF;
    IF p_payload ? 'campos_qualificacao' AND jsonb_typeof(p_payload->'campos_qualificacao') <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_QUALIFICATION_FIELDS';
    END IF;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    v_type := CASE
      WHEN v_key IN ('modo_automatico','responder_fora_horario','tts_ativo','knowledge_base_enabled','ativo') THEN 'boolean'
      WHEN v_key IN ('max_tokens','tempo_espera') THEN 'integer'
      WHEN v_key IN ('horario_inicio','horario_fim') THEN 'time'
      WHEN v_key='campos_qualificacao' THEN 'jsonb'
      ELSE 'text' END;
    v_sql := format('UPDATE public.%I SET %I = CASE WHEN $1->%L = ''null''::jsonb THEN NULL ELSE ($1->>%L)::%s END, updated_at=now() WHERE id=$2 AND empresa_id=$3',
      CASE WHEN p_config_type='ai' THEN 'orbit_ai_config' ELSE 'orbit_resend_config' END,
      v_key,v_key,v_key,v_type);
    EXECUTE v_sql USING p_payload,v_id,v_empresa_id;
  END LOOP;

  IF p_config_type='ai' THEN
    SELECT to_jsonb(a)-'tts_api_key' INTO v_safe FROM public.orbit_ai_config a
      WHERE a.id=v_id AND a.empresa_id=v_empresa_id;
    v_safe := v_safe || jsonb_build_object('has_tts_api_key',
      EXISTS (SELECT 1 FROM public.orbit_ai_config a WHERE a.id=v_id AND nullif(a.tts_api_key,'') IS NOT NULL));
  ELSE
    SELECT to_jsonb(r)-'api_key' INTO v_safe FROM public.orbit_resend_config r
      WHERE r.id=v_id AND r.empresa_id=v_empresa_id;
    v_safe := v_safe || jsonb_build_object('has_api_key',
      EXISTS (SELECT 1 FROM public.orbit_resend_config r WHERE r.id=v_id AND nullif(r.api_key,'') IS NOT NULL));
  END IF;

  INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes)
  VALUES (v_empresa_id,v_uid,'update_'||p_config_type||'_config',
    CASE WHEN p_config_type='ai' THEN 'orbit_ai_config' ELSE 'orbit_resend_config' END,
    v_id,jsonb_build_object(
      'source','tenant_config_governance_wave3_v1',
      'fields_changed',(SELECT coalesce(jsonb_agg(k ORDER BY k),'[]'::jsonb)
                        FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(v_sensitive)),
      'secret_changed',EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k=ANY(v_sensitive))
    ));

  RETURN jsonb_build_object('ok',true,'config_type',p_config_type,'data',v_safe);
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_config_mutate_scoped(text,text,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_config_mutate_scoped(text,text,jsonb)
  TO authenticated;

-- A table-level SELECT would override a column revoke. Replace it with an
-- explicit safe-column grant so TTS credentials cannot reach the browser.
REVOKE SELECT ON TABLE public.orbit_ai_config FROM authenticated;
GRANT SELECT (
  id,tom_conversa,modo_automatico,responder_fora_horario,horario_inicio,
  horario_fim,mensagem_boas_vindas,mensagem_fora_horario,created_at,updated_at,
  empresa_id,idioma,max_tokens,tempo_espera,tts_ativo,tts_provider,tts_voice_id,
  tts_modo,prompt_identidade,prompt_roteiro,prompt_regras,campos_qualificacao,
  knowledge_base_enabled,modelo_ia,advisor_locked_paths,advisor_thresholds,
  advisor_playbook_flow_prefixes,inbound_image_understanding_enabled,
  inbound_audio_transcription_enabled,scheduling_mode,scheduling_handoff_whatsapp,
  scheduling_handoff_message,scheduling_meeting_duration_minutes,
  notification_recipient_whatsapp,auto_reply_new_leads_from,block_email_collection,
  strict_commercial_stage_guard,commercial_stage_v2_enabled,
  campos_cadastro_obrigatorios,block_location_collection,primary_offer_lock,
  block_identity_split,ai_reply_debounce,mixed_payment_handoff,
  self_introduction_guard,false_benefits_guard
) ON public.orbit_ai_config TO authenticated;

COMMIT;
