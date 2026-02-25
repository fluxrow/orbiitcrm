
-- Allow super admins to UPDATE trial_requests (approve/reject)
CREATE POLICY "Super admins can update trial requests"
ON public.trial_requests
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow super admins to DELETE trial_requests
CREATE POLICY "Super admins can delete trial requests"
ON public.trial_requests
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));
