-- Replace stale JWT tenant authorization with a live server-side membership check.
BEGIN;

DROP POLICY IF EXISTS "Users can update own empresa conversas"
  ON public.orbit_conversas;
CREATE POLICY "Users can update own empresa conversas"
  ON public.orbit_conversas
  FOR UPDATE
  TO authenticated
  USING (public.user_has_empresa_access(empresa_id))
  WITH CHECK (public.user_has_empresa_access(empresa_id));

COMMIT;
