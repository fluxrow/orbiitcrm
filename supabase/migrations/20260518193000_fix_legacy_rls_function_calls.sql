CREATE OR REPLACE FUNCTION public._orbit_inline_rls_expr(p_expr text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_expr text := p_expr;
BEGIN
  IF v_expr IS NULL THEN
    RETURN NULL;
  END IF;

  v_expr := regexp_replace(
    v_expr,
    '(public\.)?get_user_empresa_id\(auth\.uid\(\)\)',
    '(SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid())',
    'g'
  );

  v_expr := regexp_replace(
    v_expr,
    '(public\.)?has_role\(auth\.uid\(\), ''super_admin''(::public\.app_role|::app_role)?\)',
    'EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ''super_admin''::public.app_role)',
    'g'
  );

  v_expr := regexp_replace(
    v_expr,
    '(public\.)?has_role\(auth\.uid\(\), ''admin''(::public\.app_role|::app_role)?\)',
    'EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ''admin''::public.app_role)',
    'g'
  );

  v_expr := regexp_replace(
    v_expr,
    '(public\.)?has_role\(auth\.uid\(\), ''vendedor''(::public\.app_role|::app_role)?\)',
    'EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ''vendedor''::public.app_role)',
    'g'
  );

  v_expr := regexp_replace(
    v_expr,
    '(public\.)?has_role\(auth\.uid\(\), ''visualizador''(::public\.app_role|::app_role)?\)',
    'EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ''visualizador''::public.app_role)',
    'g'
  );

  v_expr := regexp_replace(
    v_expr,
    '(public\.)?pe_user_is_orbit_admin\(auth\.uid\(\)\)',
    'EXISTS (SELECT 1 FROM public.pe_users u JOIN public.pe_roles r ON r.id = u.role_id WHERE u.id = auth.uid() AND r.code IN (''ORG_ADMIN'', ''ORG_MANAGER''))',
    'g'
  );

  v_expr := regexp_replace(
    v_expr,
    '(public\.)?pe_user_is_orbit_member\(auth\.uid\(\)\)',
    'EXISTS (SELECT 1 FROM public.pe_users u JOIN public.pe_roles r ON r.id = u.role_id WHERE u.id = auth.uid() AND r.code IN (''ORG_ADMIN'', ''ORG_MANAGER'', ''ORG_SALES'', ''ORG_SDR''))',
    'g'
  );

  RETURN v_expr;
END;
$$;

DO $$
DECLARE
  p record;
  v_roles text;
  v_qual text;
  v_with_check text;
BEGIN
  FOR p IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual ~ '(get_user_empresa_id\(auth\.uid\(\)\)|has_role\(auth\.uid\(|pe_user_is_orbit_admin\(auth\.uid\(\)\)|pe_user_is_orbit_member\(auth\.uid\(\)\))')
        OR
        (with_check IS NOT NULL AND with_check ~ '(get_user_empresa_id\(auth\.uid\(\)\)|has_role\(auth\.uid\(|pe_user_is_orbit_admin\(auth\.uid\(\)\)|pe_user_is_orbit_member\(auth\.uid\(\)\))')
      )
  LOOP
    v_qual := public._orbit_inline_rls_expr(p.qual);
    v_with_check := public._orbit_inline_rls_expr(p.with_check);

    SELECT
      CASE
        WHEN array_position(p.roles, 'public'::name) IS NOT NULL THEN 'PUBLIC'
        ELSE array_to_string(ARRAY(SELECT quote_ident(role_name::text) FROM unnest(p.roles) AS role_name), ', ')
      END
    INTO v_roles;

    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      p.policyname,
      p.schemaname,
      p.tablename,
      p.permissive,
      p.cmd,
      v_roles,
      CASE WHEN v_qual IS NOT NULL THEN format(' USING (%s)', v_qual) ELSE '' END,
      CASE WHEN v_with_check IS NOT NULL THEN format(' WITH CHECK (%s)', v_with_check) ELSE '' END
    );
  END LOOP;
END;
$$;
