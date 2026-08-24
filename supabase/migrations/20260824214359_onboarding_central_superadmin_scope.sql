-- Restore the centralized onboarding console for the master Super Admin while
-- keeping regular tenant users constrained to the tenant selected in the URL.
BEGIN;

CREATE OR REPLACE FUNCTION public.orbit_tenant_onboarding_read_scoped(
  p_tenant_slug text,
  p_section text DEFAULT 'list',
  p_entity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_context_empresa_id uuid;
  v_target_empresa_id uuid;
  v_is_central_super_admin boolean := false;
  v_data jsonb;
BEGIN
  v_context_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug,
    'tenant_onboarding_context_wave4_v1'
  );

  v_is_central_super_admin :=
    btrim(p_tenant_slug) = 'fluxrow'
    AND (
      public.has_role(v_uid, 'super_admin'::public.app_role)
      OR public.pe_is_super_admin(v_uid)
    );

  IF p_section = 'list' THEN
    SELECT coalesce(jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'empresa', jsonb_build_object('nome', e.nome, 'slug', e.slug)
      ) ORDER BY o.created_at DESC
    ), '[]'::jsonb)
    INTO v_data
    FROM public.orbit_client_onboardings o
    JOIN public.orbit_empresas e ON e.id = o.empresa_id
    WHERE v_is_central_super_admin OR o.empresa_id = v_context_empresa_id;

  ELSE
    SELECT o.empresa_id
    INTO v_target_empresa_id
    FROM public.orbit_client_onboardings o
    WHERE o.id = p_entity_id
      AND (v_is_central_super_admin OR o.empresa_id = v_context_empresa_id);

    IF v_target_empresa_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ONBOARDING_TENANT_MISMATCH';
    END IF;

    IF p_section = 'assets' THEN
      SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]'::jsonb)
      INTO v_data
      FROM public.orbit_onboarding_assets a
      WHERE a.onboarding_id = p_entity_id
        AND a.empresa_id = v_target_empresa_id;

    ELSIF p_section = 'insights' THEN
      SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at), '[]'::jsonb)
      INTO v_data
      FROM public.orbit_onboarding_asset_insights i
      WHERE i.onboarding_id = p_entity_id
        AND i.empresa_id = v_target_empresa_id;

    ELSIF p_section = 'draft' THEN
      SELECT to_jsonb(d)
      INTO v_data
      FROM public.orbit_onboarding_implementation_drafts d
      WHERE d.onboarding_id = p_entity_id
        AND d.empresa_id = v_target_empresa_id;

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ONBOARDING_SECTION_NOT_SUPPORTED';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'section', p_section,
    'tenant_id', v_context_empresa_id,
    'central_scope', v_is_central_super_admin,
    'data', coalesce(v_data, CASE WHEN p_section = 'draft' THEN 'null'::jsonb ELSE '[]'::jsonb END)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_onboarding_mutate_scoped(
  p_tenant_slug text,
  p_action_type text,
  p_onboarding_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_context_empresa_id uuid;
  v_target_empresa_id uuid;
  v_is_central_super_admin boolean := false;
  v_is_admin boolean := false;
  v_onboarding public.orbit_client_onboardings%rowtype;
  v_insight_id uuid;
  v_asset_id uuid;
  v_asset public.orbit_onboarding_assets%rowtype;
  v_responses jsonb;
  v_section jsonb;
  v_items jsonb;
  v_item jsonb;
  v_next_items jsonb := '[]'::jsonb;
  v_matched boolean := false;
  v_status text;
  v_count integer := 0;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  v_context_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug,
    'tenant_onboarding_context_wave4_v1'
  );

  v_is_central_super_admin :=
    btrim(p_tenant_slug) = 'fluxrow'
    AND (
      public.has_role(v_uid, 'super_admin'::public.app_role)
      OR public.pe_is_super_admin(v_uid)
    );

  SELECT
    v_is_central_super_admin
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_memberships m
      WHERE m.user_id = v_uid
        AND m.empresa_id = v_context_empresa_id
        AND m.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid
        AND p.empresa_id = v_context_empresa_id
        AND p.ativo = true
        AND public.pe_user_is_orbit_admin(v_uid)
    )
  INTO v_is_admin;

  IF NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ADMIN_REQUIRED';
  END IF;
  IF jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ONBOARDING_PAYLOAD';
  END IF;

  SELECT * INTO v_onboarding
  FROM public.orbit_client_onboardings o
  WHERE o.id = p_onboarding_id
    AND (v_is_central_super_admin OR o.empresa_id = v_context_empresa_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ONBOARDING_TENANT_MISMATCH';
  END IF;
  v_target_empresa_id := v_onboarding.empresa_id;

  IF p_action_type = 'archive_onboarding' THEN
    UPDATE public.orbit_client_onboardings
    SET archived = true, status = 'arquivado', updated_at = now()
    WHERE id = v_onboarding.id AND empresa_id = v_target_empresa_id;
    v_changed_fields := ARRAY['archived', 'status'];
    v_count := 1;

  ELSIF p_action_type = 'update_checklist' THEN
    IF jsonb_typeof(p_payload->'checklist') <> 'array'
       OR jsonb_array_length(p_payload->'checklist') > 500
       OR pg_column_size(p_payload->'checklist') > 262144 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ONBOARDING_CHECKLIST';
    END IF;
    UPDATE public.orbit_client_onboardings
    SET implementation_checklist = p_payload->'checklist', updated_at = now()
    WHERE id = v_onboarding.id AND empresa_id = v_target_empresa_id;
    v_changed_fields := ARRAY['implementation_checklist'];
    v_count := 1;

  ELSIF p_action_type = 'update_responses' THEN
    IF jsonb_typeof(p_payload->'responses') <> 'object'
       OR pg_column_size(p_payload->'responses') > 1048576 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ONBOARDING_RESPONSES';
    END IF;
    UPDATE public.orbit_client_onboardings
    SET responses = p_payload->'responses', last_saved_at = now(), updated_at = now()
    WHERE id = v_onboarding.id AND empresa_id = v_target_empresa_id;
    v_changed_fields := ARRAY['responses', 'last_saved_at'];
    v_count := 1;

  ELSIF p_action_type = 'review_insight' THEN
    v_insight_id := nullif(p_payload->>'insight_id', '')::uuid;
    v_status := p_payload->>'status';
    IF v_insight_id IS NULL OR v_status NOT IN ('pending', 'approved', 'ignored') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_INSIGHT_REVIEW';
    END IF;
    UPDATE public.orbit_onboarding_asset_insights i
    SET review_status = v_status,
        reviewed_by = CASE WHEN v_status = 'pending' THEN NULL ELSE v_uid END,
        reviewed_at = CASE WHEN v_status = 'pending' THEN NULL ELSE now() END,
        updated_at = now()
    WHERE i.id = v_insight_id
      AND i.onboarding_id = v_onboarding.id
      AND i.empresa_id = v_target_empresa_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'INSIGHT_TENANT_MISMATCH';
    END IF;
    v_changed_fields := ARRAY['review_status', 'reviewed_by', 'reviewed_at'];

  ELSIF p_action_type = 'reconcile_asset_reference' THEN
    v_asset_id := nullif(p_payload->>'asset_id', '')::uuid;
    SELECT * INTO v_asset
    FROM public.orbit_onboarding_assets a
    WHERE a.id = v_asset_id
      AND a.onboarding_id = v_onboarding.id
      AND a.empresa_id = v_target_empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ASSET_TENANT_MISMATCH';
    END IF;

    v_responses := coalesce(v_onboarding.responses, '{}'::jsonb);
    v_section := coalesce(v_responses->v_asset.section_key, '{}'::jsonb);
    v_items := v_section->v_asset.field_key;
    IF jsonb_typeof(v_items) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ONBOARDING_ASSET_FIELD_NOT_FOUND';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
    LOOP
      IF jsonb_typeof(v_item) = 'object'
         AND v_asset.item_id IS NOT NULL
         AND v_item->>'id' = v_asset.item_id THEN
        v_item := v_item || jsonb_build_object(
          'asset_id', v_asset.id,
          'storage_path', v_asset.storage_path,
          'filename', v_asset.filename,
          'mime', v_asset.mime,
          'size_bytes', v_asset.size_bytes,
          'upload_status', 'uploaded',
          'titulo', coalesce(nullif(v_item->>'titulo', ''), v_asset.filename)
        );
        v_matched := true;
      END IF;
      v_next_items := v_next_items || jsonb_build_array(v_item);
    END LOOP;

    IF NOT v_matched THEN
      v_next_items := v_next_items || jsonb_build_array(jsonb_build_object(
        'id', coalesce(v_asset.item_id, v_asset.id::text),
        'tipo', 'Outro',
        'titulo', v_asset.filename,
        'link', '',
        'obs', '',
        'asset_id', v_asset.id,
        'storage_path', v_asset.storage_path,
        'filename', v_asset.filename,
        'mime', v_asset.mime,
        'size_bytes', v_asset.size_bytes,
        'upload_status', 'uploaded'
      ));
    END IF;

    v_section := jsonb_set(v_section, ARRAY[v_asset.field_key], v_next_items, true);
    v_responses := jsonb_set(v_responses, ARRAY[v_asset.section_key], v_section, true);
    UPDATE public.orbit_client_onboardings
    SET responses = v_responses, last_saved_at = now(), updated_at = now()
    WHERE id = v_onboarding.id AND empresa_id = v_target_empresa_id;
    v_changed_fields := ARRAY['responses', 'last_saved_at'];
    v_count := 1;

  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ONBOARDING_ACTION_NOT_SUPPORTED';
  END IF;

  INSERT INTO public.orbit_audit_log(
    empresa_id, user_id, acao, entidade, entidade_id, detalhes
  ) VALUES (
    v_target_empresa_id,
    v_uid,
    p_action_type,
    'orbit_client_onboardings',
    v_onboarding.id,
    jsonb_build_object(
      'source', 'tenant_onboarding_context_wave4_v1',
      'context_tenant_id', v_context_empresa_id,
      'central_scope', v_is_central_super_admin,
      'changed_fields', to_jsonb(v_changed_fields),
      'affected_rows', v_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', p_action_type,
    'onboarding_id', v_onboarding.id,
    'tenant_id', v_target_empresa_id,
    'central_scope', v_is_central_super_admin,
    'affected_rows', v_count
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_onboarding_read_scoped(text, text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orbit_tenant_onboarding_mutate_scoped(text, text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_onboarding_read_scoped(text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_onboarding_mutate_scoped(text, text, uuid, jsonb)
  TO authenticated;

COMMIT;
