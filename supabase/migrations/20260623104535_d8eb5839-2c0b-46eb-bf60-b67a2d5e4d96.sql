
-- 1) Admin-only SELECT on configs with secrets
DROP POLICY IF EXISTS "Users can view own empresa meta config" ON public.orbit_meta_config;
CREATE POLICY "Admins view own empresa meta config" ON public.orbit_meta_config
  FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own empresa resend_config" ON public.orbit_resend_config;
CREATE POLICY "Admins view own empresa resend_config" ON public.orbit_resend_config
  FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own empresa zapi_config" ON public.orbit_zapi_config;
CREATE POLICY "Admins view own empresa zapi_config" ON public.orbit_zapi_config
  FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()));

-- 2) Email tracking events: admins only
DROP POLICY IF EXISTS "Users can view email events for their empresa" ON public.orbit_email_events;
CREATE POLICY "Admins view email events for their empresa" ON public.orbit_email_events
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (SELECT empresa_id FROM profiles WHERE id = auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR pe_user_is_orbit_admin(auth.uid()))
  );

-- 3) Send groups: CRM members only
DROP POLICY IF EXISTS "Users can view own empresa groups" ON public.orbit_send_groups;
CREATE POLICY "Orbit members view own empresa groups" ON public.orbit_send_groups
  FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));

-- 4) Drop super-admin enumeration; provide safe function
DROP POLICY IF EXISTS "Anyone can check if super_admin exists" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.super_admin_exists()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::app_role) $$;

REVOKE ALL ON FUNCTION public.super_admin_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_exists() TO anon, authenticated;

-- 5) Restrict saas_plans + public-safe listing
DROP POLICY IF EXISTS "Authenticated can read saas_plans" ON public.saas_plans;
CREATE POLICY "Users can view their own plan" ON public.saas_plans
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT plan_id FROM public.saas_empresa
           WHERE empresa_id = get_user_empresa_id(auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.list_public_plans()
RETURNS TABLE(code text, name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT code, name FROM public.saas_plans ORDER BY name $$;

REVOKE ALL ON FUNCTION public.list_public_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_plans() TO anon, authenticated;

-- 6) trial_requests validation
ALTER TABLE public.trial_requests
  DROP CONSTRAINT IF EXISTS trial_requests_nome_len,
  DROP CONSTRAINT IF EXISTS trial_requests_empresa_len,
  DROP CONSTRAINT IF EXISTS trial_requests_email_format,
  DROP CONSTRAINT IF EXISTS trial_requests_telefone_len;

ALTER TABLE public.trial_requests
  ADD CONSTRAINT trial_requests_nome_len CHECK (length(nome) BETWEEN 2 AND 120),
  ADD CONSTRAINT trial_requests_empresa_len CHECK (length(empresa) BETWEEN 2 AND 160),
  ADD CONSTRAINT trial_requests_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND length(email) <= 254),
  ADD CONSTRAINT trial_requests_telefone_len CHECK (telefone IS NULL OR length(telefone) BETWEEN 8 AND 30);

-- 7) Storage policies for now-private campaign-images bucket
DROP POLICY IF EXISTS "Campaign images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read own empresa campaign images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to own empresa campaign images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update own empresa campaign images" ON storage.objects;

CREATE POLICY "Authenticated read own empresa campaign images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'campaign-images' AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = get_user_empresa_id(auth.uid())::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Authenticated upload to own empresa campaign images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-images' AND (
      (storage.foldername(name))[1] = get_user_empresa_id(auth.uid())::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "Authenticated update own empresa campaign images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'campaign-images' AND (
      (storage.foldername(name))[1] = get_user_empresa_id(auth.uid())::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- 8) pe_promote_prospect: add caller authorization
CREATE OR REPLACE FUNCTION public.pe_promote_prospect(
  p_empresa_id uuid,
  p_prospect_id uuid,
  p_create_opportunity boolean DEFAULT true,
  p_owner_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org_id uuid;
  v_prospect record;
  v_cliente_id uuid;
  v_contato_id uuid;
  v_oportunidade_id uuid;
  v_link_id uuid;
  v_match_type text := 'manual';
  v_confidence int := 60;
  v_etapa_id uuid;
  v_norm_email text;
  v_norm_name text;
  v_domain text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR get_user_empresa_id(auth.uid()) = p_empresa_id) THEN
    RAISE EXCEPTION 'access_denied: user does not belong to empresa %', p_empresa_id;
  END IF;

  SELECT organization_id INTO v_org_id FROM pe_tenant_map WHERE empresa_id = p_empresa_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'tenant_map_missing';
  END IF;

  SELECT * INTO v_prospect FROM orbit_prospects WHERE id = p_prospect_id;
  IF v_prospect IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;
  IF v_prospect.empresa_id <> p_empresa_id THEN
    RAISE EXCEPTION 'access_denied: prospect does not belong to empresa';
  END IF;

  v_norm_email := normalize_email(v_prospect.email_principal);
  v_domain := extract_domain(v_prospect.email_principal);
  v_norm_name := normalize_name(v_prospect.nome_razao);

  IF v_prospect.cnpj_cpf IS NOT NULL AND v_prospect.cnpj_cpf <> '' THEN
    SELECT id INTO v_cliente_id FROM clientes
    WHERE organization_id = v_org_id
      AND cnpj = regexp_replace(v_prospect.cnpj_cpf, '[^0-9]', '', 'g') LIMIT 1;
    IF v_cliente_id IS NOT NULL THEN v_match_type := 'cnpj'; v_confidence := 95; END IF;
  END IF;

  IF v_cliente_id IS NULL AND v_domain <> '' THEN
    SELECT id INTO v_cliente_id FROM clientes
    WHERE organization_id = v_org_id AND dominio_principal = v_domain LIMIT 1;
    IF v_cliente_id IS NOT NULL THEN v_match_type := 'domain'; v_confidence := 85; END IF;
  END IF;

  IF v_cliente_id IS NULL AND v_norm_name <> '' THEN
    SELECT id INTO v_cliente_id FROM clientes
    WHERE organization_id = v_org_id
      AND razao_social_normalizada = v_norm_name
      AND COALESCE(cidade,'') = COALESCE(v_prospect.cidade,'')
      AND COALESCE(uf,'') = COALESCE(v_prospect.estado,'') LIMIT 1;
    IF v_cliente_id IS NOT NULL THEN v_match_type := 'name'; v_confidence := 60; END IF;
  END IF;

  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (organization_id, razao_social, razao_social_normalizada,
      nome_fantasia, cnpj, cidade, uf, dominio_principal, status_geral)
    VALUES (v_org_id, v_prospect.nome_razao, v_norm_name, v_prospect.nome_fantasia,
      CASE WHEN v_prospect.cnpj_cpf <> '' THEN regexp_replace(v_prospect.cnpj_cpf,'[^0-9]','','g') END,
      v_prospect.cidade, v_prospect.estado, v_domain, 'ativo')
    RETURNING id INTO v_cliente_id;
    v_match_type := 'new'; v_confidence := 100;
  ELSE
    UPDATE clientes SET
      nome_fantasia = COALESCE(NULLIF(nome_fantasia,''), v_prospect.nome_fantasia),
      cidade = COALESCE(NULLIF(cidade,''), v_prospect.cidade),
      uf = COALESCE(NULLIF(uf,''), v_prospect.estado),
      dominio_principal = COALESCE(NULLIF(dominio_principal,''), v_domain)
    WHERE id = v_cliente_id;
  END IF;

  IF v_norm_email <> '' THEN
    SELECT id INTO v_contato_id FROM contatos
    WHERE organization_id = v_org_id AND email_normalizado = v_norm_email LIMIT 1;
  END IF;
  IF v_contato_id IS NULL THEN
    INSERT INTO contatos (organization_id, cliente_id, nome, email, email_normalizado,
      telefone, whatsapp, decisor)
    VALUES (v_org_id, v_cliente_id, v_prospect.nome_razao,
      v_prospect.email_principal, v_norm_email,
      v_prospect.telefone_whatsapp, v_prospect.telefone_whatsapp, false)
    RETURNING id INTO v_contato_id;
  END IF;

  INSERT INTO orbit_pe_links (empresa_id, organization_id, prospect_id,
    cliente_id, contato_id, match_type, match_confidence)
  VALUES (p_empresa_id, v_org_id, p_prospect_id, v_cliente_id, v_contato_id, v_match_type, v_confidence)
  ON CONFLICT (empresa_id, prospect_id) DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id, contato_id = EXCLUDED.contato_id,
    match_type = EXCLUDED.match_type, match_confidence = EXCLUDED.match_confidence,
    updated_at = now()
  RETURNING id INTO v_link_id;

  IF p_create_opportunity THEN
    SELECT id INTO v_etapa_id FROM funil_etapas
    WHERE organization_id = v_org_id AND tipo = 'open' ORDER BY ordem LIMIT 1;
    IF v_etapa_id IS NOT NULL THEN
      INSERT INTO oportunidades (organization_id, cliente_id, etapa_id,
        owner_user_id, created_by_user_id, titulo)
      VALUES (v_org_id, v_cliente_id, v_etapa_id,
        COALESCE(p_owner_user_id, auth.uid()), auth.uid(),
        'Solicitacao - ' || v_prospect.nome_razao)
      RETURNING id INTO v_oportunidade_id;
      UPDATE orbit_pe_links SET oportunidade_id = v_oportunidade_id WHERE id = v_link_id;
    END IF;
  END IF;

  INSERT INTO pe_audit_log (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_org_id, auth.uid(), 'PROSPECT_PROMOTED_TO_CLIENT', 'orbit_pe_link', v_link_id,
    jsonb_build_object('empresa_id', p_empresa_id, 'prospect_id', p_prospect_id,
      'cliente_id', v_cliente_id, 'contato_id', v_contato_id,
      'oportunidade_id', v_oportunidade_id,
      'match_type', v_match_type, 'match_confidence', v_confidence));

  UPDATE orbit_prospects SET status_qualificacao = 'qualificado' WHERE id = p_prospect_id;

  RETURN jsonb_build_object('organization_id', v_org_id, 'cliente_id', v_cliente_id,
    'contato_id', v_contato_id, 'oportunidade_id', v_oportunidade_id,
    'link_id', v_link_id, 'match_type', v_match_type, 'match_confidence', v_confidence);
END;
$function$;

-- 9) Revoke EXECUTE on internal SECURITY DEFINER functions
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'auto_create_followup_task()',
    'handle_new_user()',
    'handle_new_user_pe()',
    'sync_pe_role_to_user_roles()',
    'pe_backfill_import_as_lista(uuid,uuid,text,integer)',
    'pe_delete_tenant_map(uuid)',
    'pe_upsert_tenant_map(uuid,uuid)',
    'pe_promote_prospect(uuid,uuid,boolean,uuid)',
    'pe_provision_tenant(uuid,text,uuid)',
    'pe_populate_campaign_recipients(uuid)',
    'saas_can_use(uuid,text,integer)',
    'saas_increment_usage(uuid,text,integer)',
    'saas_get_empresa_plan(uuid)',
    'get_campaign_analytics_summary(uuid)',
    'get_campaign_events_timeline(uuid,text)',
    'get_campaign_recipient_counts(uuid[])',
    'get_orbit_analytics_summary(uuid)',
    'get_prospect_engagement_summary(uuid,integer)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_user_empresa_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_is_super_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_get_user_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_get_user_org_id(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_get_user_role_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_get_user_role_code(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_user_is_orbit_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_user_is_orbit_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_user_is_orbit_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_user_is_orbit_member(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_user_is_org_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_user_is_org_admin(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_user_is_sales_or_sdr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_user_is_sales_or_sdr(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pe_user_can_write(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_user_can_write(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_active_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_empresa(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_empresas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_empresas() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_empresa_by_slug(text) TO anon, authenticated, service_role;
