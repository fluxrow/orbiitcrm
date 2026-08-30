-- Corrige mutações de tarefas após troca explícita de tenant.
--
-- A política legada comparava apenas profiles.empresa_id, que é um contexto
-- persistente e único. Isso rejeitava usuários autorizados por membership e
-- Super Admins cujo tenant ativo foi escolhido pela URL/sessão.
--
-- A leitura não é alterada nesta migration. As mutações passam a exigir:
--   1. sessão authenticated;
--   2. acesso explícito ao empresa_id da própria linha;
--   3. papel operacional Orbit ou Super Admin.

ALTER TABLE public.orbit_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PE members can insert own empresa tasks" ON public.orbit_tasks;
DROP POLICY IF EXISTS "PE members can update own empresa tasks" ON public.orbit_tasks;
DROP POLICY IF EXISTS "PE members can delete own empresa tasks" ON public.orbit_tasks;

CREATE POLICY "Authorized tenant users can insert tasks"
ON public.orbit_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_empresa_access(empresa_id)
  AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR public.pe_is_super_admin((SELECT auth.uid()))
    OR public.pe_user_is_orbit_member((SELECT auth.uid()))
  )
);

CREATE POLICY "Authorized tenant users can update tasks"
ON public.orbit_tasks
FOR UPDATE
TO authenticated
USING (
  public.user_has_empresa_access(empresa_id)
  AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR public.pe_is_super_admin((SELECT auth.uid()))
    OR public.pe_user_is_orbit_member((SELECT auth.uid()))
  )
)
WITH CHECK (
  public.user_has_empresa_access(empresa_id)
  AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR public.pe_is_super_admin((SELECT auth.uid()))
    OR public.pe_user_is_orbit_member((SELECT auth.uid()))
  )
);

CREATE POLICY "Authorized tenant users can delete tasks"
ON public.orbit_tasks
FOR DELETE
TO authenticated
USING (
  public.user_has_empresa_access(empresa_id)
  AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR public.pe_is_super_admin((SELECT auth.uid()))
    OR public.pe_user_is_orbit_member((SELECT auth.uid()))
  )
);
