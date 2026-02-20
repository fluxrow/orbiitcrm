
-- ========================================
-- Etapa 4X.1: SaaS Infrastructure Tables
-- ========================================

-- 1. saas_plans
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin full access saas_plans" ON public.saas_plans FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Authenticated can read saas_plans" ON public.saas_plans FOR SELECT TO authenticated USING (true);

-- Seed default plans
INSERT INTO public.saas_plans (code, name, features, limits) VALUES
  ('demo', 'Demo', '{"whatsapp":true,"email":true,"instagram":false,"facebook":false,"lead_finder":false,"ai_agent":true}', '{"max_users":2,"max_prospects":50,"email_monthly":100,"whatsapp_monthly":100,"ig_monthly":0,"fb_monthly":0,"lead_search_monthly":0}'),
  ('basic', 'Basic', '{"whatsapp":true,"email":true,"instagram":false,"facebook":false,"lead_finder":false,"ai_agent":true}', '{"max_users":5,"max_prospects":500,"email_monthly":1000,"whatsapp_monthly":1000,"ig_monthly":0,"fb_monthly":0,"lead_search_monthly":0}'),
  ('professional', 'Professional', '{"whatsapp":true,"email":true,"instagram":true,"facebook":true,"lead_finder":true,"ai_agent":true}', '{"max_users":15,"max_prospects":5000,"email_monthly":10000,"whatsapp_monthly":5000,"ig_monthly":2000,"fb_monthly":2000,"lead_search_monthly":500}'),
  ('plus', 'Plus', '{"whatsapp":true,"email":true,"instagram":true,"facebook":true,"lead_finder":true,"ai_agent":true}', '{"max_users":50,"max_prospects":50000,"email_monthly":50000,"whatsapp_monthly":25000,"ig_monthly":10000,"fb_monthly":10000,"lead_search_monthly":5000}')
ON CONFLICT (code) DO NOTHING;

-- 2. saas_empresa
CREATE TABLE IF NOT EXISTS public.saas_empresa (
  empresa_id uuid PRIMARY KEY REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.saas_plans(id),
  status text NOT NULL DEFAULT 'invited',
  responsible_name text,
  responsible_email text,
  invited_at timestamptz,
  activated_at timestamptz,
  trial_ends_at timestamptz,
  billing_status text,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin full access saas_empresa" ON public.saas_empresa FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can view own empresa saas_empresa" ON public.saas_empresa FOR SELECT USING (empresa_id = get_user_empresa_id(auth.uid()));

-- 3. saas_invites
CREATE TABLE IF NOT EXISTS public.saas_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  email text NOT NULL,
  responsible_name text,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user_id uuid,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saas_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin full access saas_invites" ON public.saas_invites FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 4. saas_usage_monthly
CREATE TABLE IF NOT EXISTS public.saas_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  period text NOT NULL,
  email_sent int NOT NULL DEFAULT 0,
  whatsapp_sent int NOT NULL DEFAULT 0,
  ig_sent int NOT NULL DEFAULT 0,
  fb_sent int NOT NULL DEFAULT 0,
  lead_search_calls int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, period)
);
ALTER TABLE public.saas_usage_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin full access saas_usage_monthly" ON public.saas_usage_monthly FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can view own empresa usage" ON public.saas_usage_monthly FOR SELECT USING (empresa_id = get_user_empresa_id(auth.uid()));

-- 5. cnpj_normalized column + trigger on orbit_empresas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orbit_empresas' AND column_name = 'cnpj_normalized'
  ) THEN
    ALTER TABLE public.orbit_empresas ADD COLUMN cnpj_normalized text;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_normalize_cnpj()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.cnpj IS NOT NULL AND NEW.cnpj <> '' THEN
    NEW.cnpj_normalized := regexp_replace(NEW.cnpj, '[^0-9]', '', 'g');
  ELSE
    NEW.cnpj_normalized := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cnpj ON public.orbit_empresas;
CREATE TRIGGER trg_normalize_cnpj
  BEFORE INSERT OR UPDATE OF cnpj ON public.orbit_empresas
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_cnpj();

-- Partial unique index: CNPJ uniqueness (excluding NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS uq_orbit_empresas_cnpj_norm
  ON public.orbit_empresas (cnpj_normalized)
  WHERE cnpj_normalized IS NOT NULL;
