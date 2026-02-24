
-- 1) Add slug columns to orbit_empresas
ALTER TABLE public.orbit_empresas
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS slug_created_at timestamptz;

-- Unique partial index on slug (only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orbit_empresas_slug_unique
  ON public.orbit_empresas (slug) WHERE slug IS NOT NULL;

-- 2) normalize_slug function
CREATE OR REPLACE FUNCTION public.normalize_slug(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT trim(BOTH '-' FROM
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            COALESCE(p, ''),
            'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇçÑñ',
            'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
          )
        ),
        '[^a-z0-9 -]', '', 'g'
      ),
      '[ -]+', '-', 'g'
    )
  )
$$;

-- 3) generate_unique_slug function
CREATE OR REPLACE FUNCTION public.generate_unique_slug(p_nome text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_suffix int := 2;
BEGIN
  v_base := normalize_slug(p_nome);
  IF v_base = '' OR v_base IS NULL THEN
    v_base := 'empresa';
  END IF;
  -- Truncate to 40 chars max
  v_base := left(v_base, 40);
  v_candidate := v_base;

  WHILE EXISTS (SELECT 1 FROM orbit_empresas WHERE slug = v_candidate) LOOP
    v_candidate := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
    IF v_suffix > 100 THEN
      v_candidate := v_base || '-' || substr(gen_random_uuid()::text, 1, 6);
      EXIT;
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- 4) get_empresa_by_slug RPC (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_empresa_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa record;
  v_plan_code text;
  v_saas_status text;
  v_trial_ends_at timestamptz;
BEGIN
  SELECT e.id, e.nome, e.ativo, se.status AS saas_status, se.trial_ends_at, sp.code AS plan_code
  INTO v_empresa
  FROM orbit_empresas e
  JOIN saas_empresa se ON se.empresa_id = e.id
  JOIN saas_plans sp ON sp.id = se.plan_id
  WHERE e.slug = p_slug;

  IF v_empresa IS NULL THEN
    RETURN NULL;
  END IF;

  -- Demo cannot be accessed via slug
  IF v_empresa.plan_code = 'demo' THEN
    RETURN NULL;
  END IF;

  -- Check if blocked
  IF v_empresa.saas_status NOT IN ('trial', 'active') THEN
    RETURN jsonb_build_object(
      'empresa_id', v_empresa.id,
      'nome', v_empresa.nome,
      'plan_code', v_empresa.plan_code,
      'saas_status', v_empresa.saas_status,
      'trial_ends_at', v_empresa.trial_ends_at,
      'blocked', true,
      'reason', CASE
        WHEN v_empresa.saas_status = 'suspended' THEN 'suspended'
        WHEN v_empresa.saas_status = 'canceled' THEN 'canceled'
        ELSE 'inactive'
      END
    );
  END IF;

  -- Check trial expiry
  IF v_empresa.saas_status = 'trial' AND v_empresa.trial_ends_at IS NOT NULL AND v_empresa.trial_ends_at < now() THEN
    RETURN jsonb_build_object(
      'empresa_id', v_empresa.id,
      'nome', v_empresa.nome,
      'plan_code', v_empresa.plan_code,
      'saas_status', v_empresa.saas_status,
      'trial_ends_at', v_empresa.trial_ends_at,
      'blocked', true,
      'reason', 'trial_expired'
    );
  END IF;

  RETURN jsonb_build_object(
    'empresa_id', v_empresa.id,
    'nome', v_empresa.nome,
    'plan_code', v_empresa.plan_code,
    'saas_status', v_empresa.saas_status,
    'trial_ends_at', v_empresa.trial_ends_at,
    'blocked', false
  );
END;
$$;
