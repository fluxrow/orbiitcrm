CREATE OR REPLACE FUNCTION public.pe_tenant_health_report()
RETURNS TABLE(empresa_id uuid, empresa_nome text, empresa_slug text, vendedores_total integer, vendedores_com_telefone integer, distribuicao_ativos integer, prospects_total integer, prospects_sem_responsavel integer, zapi_configurado boolean, zapi_envio_real_liberado boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.pe_is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id AS empresa_id,
    e.nome AS empresa_nome,
    COALESCE(e.slug, '') AS empresa_slug,
    (SELECT COUNT(*)::int FROM profiles p WHERE p.empresa_id = e.id) AS vendedores_total,
    (SELECT COUNT(*)::int FROM profiles p WHERE p.empresa_id = e.id AND NULLIF(TRIM(p.telefone), '') IS NOT NULL) AS vendedores_com_telefone,
    (SELECT COUNT(*)::int FROM orbit_distribuicao_config d WHERE d.empresa_id = e.id AND d.ativo = true) AS distribuicao_ativos,
    (SELECT COUNT(*)::int FROM orbit_prospects op WHERE op.empresa_id = e.id) AS prospects_total,
    (SELECT COUNT(*)::int FROM orbit_prospects op WHERE op.empresa_id = e.id AND op.responsavel_id IS NULL) AS prospects_sem_responsavel,
    EXISTS (SELECT 1 FROM orbit_zapi_config z WHERE z.empresa_id = e.id AND z.ativo = true) AS zapi_configurado,
    COALESCE((SELECT z.envio_real_liberado FROM orbit_zapi_config z WHERE z.empresa_id = e.id ORDER BY z.updated_at DESC LIMIT 1), false) AS zapi_envio_real_liberado
  FROM orbit_empresas e
  ORDER BY e.nome;
END;
$function$;