CREATE POLICY "flow_events tenant insert"
ON public.orbit_flow_events
FOR INSERT
TO authenticated
WITH CHECK (user_has_empresa_access(empresa_id));