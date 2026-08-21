-- Wave 4.3e: granular, tenant-scoped campaign capabilities. No user receives
-- an explicit grant in this migration; tenant admins and the super admin keep
-- their existing authority, and the rollout remains canary-scoped by flag.
BEGIN;

CREATE TABLE IF NOT EXISTS public.orbit_tenant_user_permissions (
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL CHECK (permission_key IN (
    'campaign_create',
    'campaign_edit',
    'campaign_submit_review',
    'campaign_approve',
    'campaign_dispatch'
  )),
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (empresa_id, user_id, permission_key)
);

ALTER TABLE public.orbit_tenant_user_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orbit_tenant_user_permissions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.orbit_tenant_user_permissions TO authenticated;
GRANT ALL ON TABLE public.orbit_tenant_user_permissions TO service_role;

CREATE OR REPLACE FUNCTION public.orbit_user_has_campaign_permission(
  p_empresa_id uuid,
  p_user_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT p_empresa_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND p_permission_key IN (
      'campaign_create','campaign_edit','campaign_submit_review',
      'campaign_approve','campaign_dispatch'
    )
    AND (
      public.has_role(p_user_id, 'super_admin'::public.app_role)
      OR public.pe_is_super_admin(p_user_id)
      OR (
        public.user_has_empresa_access(p_empresa_id)
        AND (
          public.has_role(p_user_id, 'admin'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_empresa_memberships m
            WHERE m.user_id=p_user_id AND m.empresa_id=p_empresa_id AND m.role='admin'
          )
          OR EXISTS (
            SELECT 1 FROM public.orbit_tenant_user_permissions p
            WHERE p.empresa_id=p_empresa_id
              AND p.user_id=p_user_id
              AND p.permission_key=p_permission_key
              AND p.revoked_at IS NULL
          )
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.orbit_user_has_campaign_permission(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_user_has_campaign_permission(uuid,uuid,text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS tenant_user_permissions_read_self_or_admin
  ON public.orbit_tenant_user_permissions;
CREATE POLICY tenant_user_permissions_read_self_or_admin
ON public.orbit_tenant_user_permissions FOR SELECT TO authenticated
USING (
  user_id=auth.uid()
  OR public.orbit_user_has_campaign_permission(empresa_id,auth.uid(),'campaign_approve')
);

CREATE OR REPLACE FUNCTION public.orbit_tenant_campaign_authorize(
  p_tenant_slug text,
  p_action_type text,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_permission text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='UNAUTHENTICATED';
  END IF;

  SELECT e.id INTO v_empresa_id
  FROM public.orbit_empresas e
  JOIN public.orbit_feature_flags f
    ON f.empresa_id=e.id
   AND f.feature_key='tenant_campaign_mutations_wave4_v1'
   AND f.enabled=true
  WHERE e.slug=btrim(p_tenant_slug) AND coalesce(e.ativo,false)=true;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TENANT_CAMPAIGN_FEATURE_DISABLED';
  END IF;

  v_permission := CASE
    WHEN p_action_type='save_draft' AND p_campaign_id IS NULL THEN 'campaign_create'
    WHEN p_action_type IN ('save_draft','populate_recipients','pause_campaign','cancel_campaign') THEN 'campaign_edit'
    WHEN p_action_type='mark_in_review' THEN 'campaign_submit_review'
    WHEN p_action_type='approve_campaign' THEN 'campaign_approve'
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='UNKNOWN_CAMPAIGN_ACTION';
  END IF;
  IF NOT public.orbit_user_has_campaign_permission(v_empresa_id,v_uid,v_permission) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='CAMPAIGN_PERMISSION_DENIED:'||v_permission;
  END IF;
  RETURN v_empresa_id;
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_campaign_authorize(text,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_campaign_authorize(text,text,uuid)
  TO authenticated;

-- Patch the already-versioned campaign RPC at its single authorization seam.
-- The guard makes schema drift fail closed instead of silently weakening auth.
DO $patch$
DECLARE
  v_definition text;
  v_original text;
BEGIN
  SELECT pg_get_functiondef(
    'public.orbit_tenant_campaign_mutate_scoped(text,text,uuid,jsonb)'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;
  v_definition := replace(
    v_definition,
    'v_empresa_id := public.orbit_tenant_mutation_authorize(' || chr(10) ||
    '    p_tenant_slug, ''tenant_campaign_mutations_wave4_v1''' || chr(10) ||
    '  );',
    'v_empresa_id := public.orbit_tenant_campaign_authorize(' || chr(10) ||
    '    p_tenant_slug, p_action_type, p_campaign_id' || chr(10) ||
    '  );'
  );
  IF v_definition=v_original THEN
    RAISE EXCEPTION 'CAMPAIGN_RPC_AUTHORIZATION_SEAM_NOT_FOUND';
  END IF;
  EXECUTE v_definition;
END
$patch$;

REVOKE ALL ON FUNCTION public.orbit_tenant_campaign_mutate_scoped(text,text,uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_campaign_mutate_scoped(text,text,uuid,jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.orbit_get_tenant_campaign_capabilities(
  p_tenant_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='UNAUTHENTICATED';
  END IF;
  SELECT e.id INTO v_empresa_id
  FROM public.orbit_empresas e
  WHERE e.slug=btrim(p_tenant_slug) AND coalesce(e.ativo,false)=true;
  IF v_empresa_id IS NULL OR NOT public.user_has_empresa_access(v_empresa_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TENANT_ACCESS_DENIED';
  END IF;
  RETURN jsonb_build_object(
    'campaign_create',public.orbit_user_has_campaign_permission(v_empresa_id,v_uid,'campaign_create'),
    'campaign_edit',public.orbit_user_has_campaign_permission(v_empresa_id,v_uid,'campaign_edit'),
    'campaign_submit_review',public.orbit_user_has_campaign_permission(v_empresa_id,v_uid,'campaign_submit_review'),
    'campaign_approve',public.orbit_user_has_campaign_permission(v_empresa_id,v_uid,'campaign_approve'),
    'campaign_dispatch',public.orbit_user_has_campaign_permission(v_empresa_id,v_uid,'campaign_dispatch')
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_get_tenant_campaign_capabilities(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_get_tenant_campaign_capabilities(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.orbit_set_tenant_campaign_permission(
  p_tenant_slug text,
  p_user_id uuid,
  p_permission_key text,
  p_granted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
BEGIN
  -- Management remains an admin-only operation. The more permissive campaign
  -- action authorizer is deliberately not used here.
  v_empresa_id := public.orbit_tenant_mutation_authorize(
    p_tenant_slug,'tenant_campaign_mutations_wave4_v1'
  );
  IF p_user_id IS NULL OR p_permission_key NOT IN (
    'campaign_create','campaign_edit','campaign_submit_review',
    'campaign_approve','campaign_dispatch'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_CAMPAIGN_PERMISSION';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=p_user_id AND p.empresa_id=v_empresa_id AND coalesce(p.ativo,false)=true
    UNION ALL
    SELECT 1 FROM public.user_empresa_memberships m
    WHERE m.user_id=p_user_id AND m.empresa_id=v_empresa_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TARGET_USER_NOT_IN_TENANT';
  END IF;

  INSERT INTO public.orbit_tenant_user_permissions(
    empresa_id,user_id,permission_key,granted_by,granted_at,revoked_at,metadata
  ) VALUES (
    v_empresa_id,p_user_id,p_permission_key,v_uid,now(),
    CASE WHEN p_granted THEN NULL ELSE now() END,
    jsonb_build_object('tenant_slug',btrim(p_tenant_slug),'source','tenant_admin_rpc')
  )
  ON CONFLICT (empresa_id,user_id,permission_key) DO UPDATE SET
    granted_by=excluded.granted_by,
    granted_at=excluded.granted_at,
    revoked_at=excluded.revoked_at,
    metadata=excluded.metadata;

  INSERT INTO public.orbit_audit_log(
    empresa_id,user_id,acao,entidade,entidade_id,detalhes
  ) VALUES (
    v_empresa_id,v_uid,
    CASE WHEN p_granted THEN 'campaign_permission_granted' ELSE 'campaign_permission_revoked' END,
    'orbit_tenant_user_permissions',p_user_id,
    jsonb_build_object('permission_key',p_permission_key,'target_user_id',p_user_id)
  );
  RETURN jsonb_build_object(
    'ok',true,'user_id',p_user_id,'permission_key',p_permission_key,'granted',p_granted
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_set_tenant_campaign_permission(text,uuid,text,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_set_tenant_campaign_permission(text,uuid,text,boolean)
  TO authenticated;

COMMIT;
