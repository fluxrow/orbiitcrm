
-- Advisor messages: enforce thread ownership + empresa consistency + empresa access
DROP POLICY IF EXISTS "advisor_messages tenant read" ON public.orbit_advisor_messages;
DROP POLICY IF EXISTS "advisor_messages owner insert" ON public.orbit_advisor_messages;

CREATE POLICY "advisor_messages tenant read"
ON public.orbit_advisor_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orbit_advisor_threads t
    WHERE t.id = orbit_advisor_messages.thread_id
      AND t.user_id = auth.uid()
      AND t.empresa_id = orbit_advisor_messages.empresa_id
      AND public.user_has_empresa_access(t.empresa_id)
  )
);

CREATE POLICY "advisor_messages owner insert"
ON public.orbit_advisor_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orbit_advisor_threads t
    WHERE t.id = orbit_advisor_messages.thread_id
      AND t.user_id = auth.uid()
      AND t.empresa_id = orbit_advisor_messages.empresa_id
      AND public.user_has_empresa_access(t.empresa_id)
  )
);

-- Advisor threads: require empresa access on update/delete
DROP POLICY IF EXISTS "advisor_threads owner update" ON public.orbit_advisor_threads;
DROP POLICY IF EXISTS "advisor_threads owner delete" ON public.orbit_advisor_threads;

CREATE POLICY "advisor_threads owner update"
ON public.orbit_advisor_threads
FOR UPDATE
USING (user_id = auth.uid() AND public.user_has_empresa_access(empresa_id))
WITH CHECK (user_id = auth.uid() AND public.user_has_empresa_access(empresa_id));

CREATE POLICY "advisor_threads owner delete"
ON public.orbit_advisor_threads
FOR DELETE
USING (user_id = auth.uid() AND public.user_has_empresa_access(empresa_id));

-- Email events: standardize on Orbit tenant admin only; super admin separate
DROP POLICY IF EXISTS "Admins view email events for their empresa" ON public.orbit_email_events;

CREATE POLICY "Orbit admins view email events for their empresa"
ON public.orbit_email_events
FOR SELECT
USING (
  empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
);

CREATE POLICY "Super admins view all email events"
ON public.orbit_email_events
FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'::app_role));
