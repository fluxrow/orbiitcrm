
CREATE OR REPLACE FUNCTION public.get_my_empresas()
 RETURNS TABLE(empresa_id uuid, nome text, slug text, role text, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid,
           public.pe_is_super_admin(auth.uid()) AS is_sa,
           (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()) AS active_empresa
  )
  SELECT
    e.id AS empresa_id,
    e.nome,
    e.slug,
    COALESCE(m.role, CASE WHEN me.is_sa THEN 'super_admin' ELSE 'member' END) AS role,
    (e.id = me.active_empresa) AS is_active
  FROM me
  JOIN public.orbit_empresas e
    ON e.ativo = true
   AND (me.is_sa OR EXISTS (
     SELECT 1 FROM public.user_empresa_memberships m2
     WHERE m2.user_id = me.uid AND m2.empresa_id = e.id
   ))
  LEFT JOIN public.user_empresa_memberships m
    ON m.user_id = me.uid AND m.empresa_id = e.id
  ORDER BY e.nome;
$function$;
