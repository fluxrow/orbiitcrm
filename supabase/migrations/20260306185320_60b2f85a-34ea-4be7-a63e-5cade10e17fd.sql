-- Update RLS to allow viewing empresa-specific OR global stages
DROP POLICY IF EXISTS "Users can view own empresa stages" ON orbit_pipeline_stages;
CREATE POLICY "Users can view own empresa stages"
  ON orbit_pipeline_stages FOR SELECT TO authenticated
  USING (
    empresa_id IS NULL
    OR empresa_id = get_user_empresa_id(auth.uid())
  );