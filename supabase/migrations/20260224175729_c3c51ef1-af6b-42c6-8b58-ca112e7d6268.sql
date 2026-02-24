
CREATE TABLE public.trial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  empresa text NOT NULL,
  email text NOT NULL,
  telefone text,
  plan_code text NOT NULL DEFAULT 'basic',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert trial requests"
  ON public.trial_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Super admins can read trial requests"
  ON public.trial_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));
