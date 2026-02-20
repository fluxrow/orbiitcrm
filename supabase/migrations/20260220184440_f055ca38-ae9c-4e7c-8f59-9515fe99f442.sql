
-- 1. Indexes on saas_empresa
CREATE INDEX IF NOT EXISTS idx_saas_empresa_status ON public.saas_empresa(status);
CREATE INDEX IF NOT EXISTS idx_saas_empresa_email ON public.saas_empresa(responsible_email);

-- 2. Indexes on saas_invites
CREATE INDEX IF NOT EXISTS idx_saas_invites_empresa ON public.saas_invites(empresa_id);
CREATE INDEX IF NOT EXISTS idx_saas_invites_email ON public.saas_invites(email);
CREATE INDEX IF NOT EXISTS idx_saas_invites_expires ON public.saas_invites(expires_at);

-- 3. Add metadata column to saas_invites
ALTER TABLE public.saas_invites ADD COLUMN IF NOT EXISTS metadata jsonb NULL;

-- 4. Drop duplicate RLS policy
DROP POLICY IF EXISTS "Users can view own empresa saas_empresa" ON public.saas_empresa;
