
-- 1) Add pricing columns to saas_plans (negotiable per tenant via overrides later)
ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer,
  ADD COLUMN IF NOT EXISTS setup_fee_cents integer;

-- 2) Upsert the single Orbit plan (R$1.200/mês base + R$3.000 implementação)
INSERT INTO public.saas_plans (code, name, features, limits, monthly_price_cents, setup_fee_cents, stripe_active)
VALUES (
  'orbit',
  'Orbit',
  '{"ai_agent":true,"email":true,"whatsapp":true,"facebook":true,"instagram":true,"lead_finder":true}'::jsonb,
  '{"max_users":25,"max_prospects":25000,"email_monthly":25000,"whatsapp_monthly":15000,"fb_monthly":5000,"ig_monthly":5000,"lead_search_monthly":2000}'::jsonb,
  120000,
  300000,
  true
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    features = EXCLUDED.features,
    limits = EXCLUDED.limits,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    setup_fee_cents = EXCLUDED.setup_fee_cents,
    updated_at = now();

-- 3) Backfill: ensure every orbit_empresas has a saas_empresa row pointing to the Orbit plan
INSERT INTO public.saas_empresa (empresa_id, plan_id, status, invited_at, created_at, updated_at)
SELECT
  oe.id,
  (SELECT id FROM public.saas_plans WHERE code = 'orbit'),
  'invited',
  now(),
  now(),
  now()
FROM public.orbit_empresas oe
LEFT JOIN public.saas_empresa se ON se.empresa_id = oe.id
WHERE se.empresa_id IS NULL;

-- 4) Per-tenant price override columns on saas_empresa (allows negotiation)
ALTER TABLE public.saas_empresa
  ADD COLUMN IF NOT EXISTS monthly_price_cents_override integer,
  ADD COLUMN IF NOT EXISTS setup_fee_cents_override integer;
