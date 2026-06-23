
-- Tokens OAuth Google por empresa
CREATE TABLE public.orbit_google_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  google_email text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  calendar_id text NOT NULL DEFAULT 'primary',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_google_tokens TO authenticated;
GRANT ALL ON public.orbit_google_tokens TO service_role;

ALTER TABLE public.orbit_google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa members manage google tokens"
ON public.orbit_google_tokens
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.get_user_empresa_id(auth.uid()) = empresa_id
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.get_user_empresa_id(auth.uid()) = empresa_id
);

CREATE TRIGGER orbit_google_tokens_updated_at
BEFORE UPDATE ON public.orbit_google_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX orbit_google_tokens_empresa_idx ON public.orbit_google_tokens(empresa_id);

-- OAuth state (CSRF protection) — só service_role acessa
CREATE TABLE public.orbit_google_oauth_states (
  state text PRIMARY KEY,
  empresa_id uuid NOT NULL,
  user_id uuid NOT NULL,
  redirect_after text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

GRANT ALL ON public.orbit_google_oauth_states TO service_role;

ALTER TABLE public.orbit_google_oauth_states ENABLE ROW LEVEL SECURITY;

-- (sem policies = ninguém via Data API alcança; apenas service_role)
