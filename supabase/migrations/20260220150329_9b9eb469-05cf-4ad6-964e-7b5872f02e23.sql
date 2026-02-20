
-- RPC: pe_upsert_tenant_map
CREATE OR REPLACE FUNCTION public.pe_upsert_tenant_map(
  p_empresa_id uuid,
  p_organization_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT pe_is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access_denied: only super admins can manage tenant mappings';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM orbit_empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'empresa_not_found: %', p_empresa_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'organization_not_found: %', p_organization_id;
  END IF;

  INSERT INTO pe_tenant_map (empresa_id, organization_id)
  VALUES (p_empresa_id, p_organization_id)
  ON CONFLICT (empresa_id) DO UPDATE SET organization_id = EXCLUDED.organization_id;

  INSERT INTO pe_audit_log (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_organization_id, auth.uid(), 'TENANT_MAP_UPSERT', 'pe_tenant_map', null,
    jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', p_organization_id)
  );

  RETURN jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', p_organization_id);
END;
$$;

-- RPC: pe_delete_tenant_map
CREATE OR REPLACE FUNCTION public.pe_delete_tenant_map(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org_id uuid;
BEGIN
  IF NOT pe_is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT organization_id INTO v_org_id FROM pe_tenant_map WHERE empresa_id = p_empresa_id;

  DELETE FROM pe_tenant_map WHERE empresa_id = p_empresa_id;

  INSERT INTO pe_audit_log (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id, auth.uid(), 'TENANT_MAP_DELETED', 'pe_tenant_map', null,
    jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', v_org_id)
  );
END;
$$;
