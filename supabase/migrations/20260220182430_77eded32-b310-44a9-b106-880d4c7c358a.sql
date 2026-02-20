
-- Add SELECT policy on saas_empresa so users can read their own plan info
CREATE POLICY "Users can view own saas_empresa"
  ON public.saas_empresa FOR SELECT
  USING (empresa_id = get_user_empresa_id(auth.uid()));
