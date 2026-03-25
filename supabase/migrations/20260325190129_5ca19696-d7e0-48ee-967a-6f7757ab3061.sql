
-- 1) Update get_empresa_by_slug to allow past_due access and return stripe_status
CREATE OR REPLACE FUNCTION public.get_empresa_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa record;
BEGIN
  SELECT e.id, e.nome, e.ativo, se.status AS saas_status, se.trial_ends_at, 
         sp.code AS plan_code, se.stripe_status
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

  -- Check trial expiry first
  IF v_empresa.saas_status = 'trial' AND v_empresa.trial_ends_at IS NOT NULL AND v_empresa.trial_ends_at < now() THEN
    RETURN jsonb_build_object(
      'empresa_id', v_empresa.id,
      'nome', v_empresa.nome,
      'plan_code', v_empresa.plan_code,
      'saas_status', v_empresa.saas_status,
      'stripe_status', v_empresa.stripe_status,
      'trial_ends_at', v_empresa.trial_ends_at,
      'blocked', true,
      'reason', 'trial_expired'
    );
  END IF;

  -- past_due: allow access (degraded) — NOT blocked
  -- unpaid: allow access (readonly) — NOT blocked but degraded
  -- canceled, suspended, expired, pending: blocked
  IF v_empresa.saas_status NOT IN ('trial', 'active', 'past_due', 'unpaid') THEN
    RETURN jsonb_build_object(
      'empresa_id', v_empresa.id,
      'nome', v_empresa.nome,
      'plan_code', v_empresa.plan_code,
      'saas_status', v_empresa.saas_status,
      'stripe_status', v_empresa.stripe_status,
      'trial_ends_at', v_empresa.trial_ends_at,
      'blocked', true,
      'reason', CASE
        WHEN v_empresa.saas_status = 'suspended' THEN 'suspended'
        WHEN v_empresa.saas_status = 'canceled' THEN 'canceled'
        WHEN v_empresa.saas_status = 'expired' THEN 'expired'
        ELSE 'inactive'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'empresa_id', v_empresa.id,
    'nome', v_empresa.nome,
    'plan_code', v_empresa.plan_code,
    'saas_status', v_empresa.saas_status,
    'stripe_status', v_empresa.stripe_status,
    'trial_ends_at', v_empresa.trial_ends_at,
    'blocked', false
  );
END;
$$;

-- 2) Update saas_can_use to handle past_due (degraded) and add max_users/max_prospects validation
CREATE OR REPLACE FUNCTION public.saas_can_use(p_empresa_id uuid, p_feature_code text, p_amount int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan jsonb;
  v_status text;
  v_trial_ends_at timestamptz;
  v_feature_flag text;
  v_limit_key text;
  v_usage_col text;
  v_period text;
  v_current_usage int;
  v_limit_val int;
  v_features jsonb;
  v_limits jsonb;
  v_count int;
BEGIN
  -- 1) Get plan
  v_plan := saas_get_empresa_plan(p_empresa_id);
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'NO_PLAN', 'plan_code', null);
  END IF;

  v_status := v_plan->>'status';
  v_trial_ends_at := (v_plan->>'trial_ends_at')::timestamptz;
  v_features := v_plan->'features';
  v_limits := v_plan->'limits';

  -- 2) Check status — past_due blocks write operations but allows reads
  IF v_status = 'past_due' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'PLAN_STATUS_BLOCKED', 'plan_code', v_plan->>'plan_code',
      'detail', 'Há uma pendência de pagamento. Regularize para continuar usando este recurso.');
  END IF;

  IF v_status NOT IN ('active', 'trial') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'SUSPENDED', 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 3) Check trial expiry
  IF v_status = 'trial' AND v_trial_ends_at IS NOT NULL AND v_trial_ends_at < now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'TRIAL_EXPIRED', 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 4) Handle max_users and max_prospects (count-based, not usage-based)
  IF p_feature_code = 'user_add' THEN
    v_limit_val := COALESCE((v_limits->>'max_users')::int, 0);
    SELECT count(*) INTO v_count FROM profiles WHERE empresa_id = p_empresa_id AND ativo = true;
    IF v_count + p_amount > v_limit_val THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'PLAN_LIMIT_REACHED', 'plan_code', v_plan->>'plan_code',
        'current', v_count, 'limit', v_limit_val, 'remaining', GREATEST(v_limit_val - v_count, 0));
    END IF;
    RETURN jsonb_build_object('allowed', true, 'remaining', v_limit_val - v_count, 'plan_code', v_plan->>'plan_code');
  END IF;

  IF p_feature_code = 'prospect_add' THEN
    v_limit_val := COALESCE((v_limits->>'max_prospects')::int, 0);
    SELECT count(*) INTO v_count FROM orbit_prospects WHERE empresa_id = p_empresa_id;
    IF v_count + p_amount > v_limit_val THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'PLAN_LIMIT_REACHED', 'plan_code', v_plan->>'plan_code',
        'current', v_count, 'limit', v_limit_val, 'remaining', GREATEST(v_limit_val - v_count, 0));
    END IF;
    RETURN jsonb_build_object('allowed', true, 'remaining', v_limit_val - v_count, 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 5) Map feature_code to feature flag key
  v_feature_flag := CASE p_feature_code
    WHEN 'email_send' THEN 'email'
    WHEN 'whatsapp_send' THEN 'whatsapp'
    WHEN 'ig_send' THEN 'instagram'
    WHEN 'fb_send' THEN 'facebook'
    WHEN 'lead_search' THEN 'lead_finder'
    ELSE p_feature_code
  END;

  -- 6) Check feature flag
  IF NOT COALESCE((v_features->>v_feature_flag)::boolean, false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'FEATURE_DISABLED', 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 7) Map feature_code to limit key and usage column
  v_limit_key := CASE p_feature_code
    WHEN 'email_send' THEN 'email_monthly'
    WHEN 'whatsapp_send' THEN 'whatsapp_monthly'
    WHEN 'ig_send' THEN 'ig_monthly'
    WHEN 'fb_send' THEN 'fb_monthly'
    WHEN 'lead_search' THEN 'lead_search_monthly'
    ELSE null
  END;

  v_usage_col := CASE p_feature_code
    WHEN 'email_send' THEN 'email_sent'
    WHEN 'whatsapp_send' THEN 'whatsapp_sent'
    WHEN 'ig_send' THEN 'ig_sent'
    WHEN 'fb_send' THEN 'fb_sent'
    WHEN 'lead_search' THEN 'lead_search_calls'
    ELSE null
  END;

  IF v_limit_key IS NULL OR v_usage_col IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'remaining', -1, 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 8) Get limit value
  v_limit_val := COALESCE((v_limits->>v_limit_key)::int, 0);

  -- 9) Get current period
  v_period := to_char(now(), 'YYYY-MM');

  -- 10) Upsert usage row
  INSERT INTO saas_usage_monthly (empresa_id, period)
  VALUES (p_empresa_id, v_period)
  ON CONFLICT (empresa_id, period) DO NOTHING;

  -- 11) Read current usage
  EXECUTE format(
    'SELECT COALESCE(%I, 0) FROM saas_usage_monthly WHERE empresa_id = $1 AND period = $2',
    v_usage_col
  ) INTO v_current_usage USING p_empresa_id, v_period;

  -- 12) Check limit
  IF v_current_usage + p_amount > v_limit_val THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'PLAN_LIMIT',
      'plan_code', v_plan->>'plan_code',
      'current', v_current_usage,
      'limit', v_limit_val,
      'remaining', GREATEST(v_limit_val - v_current_usage, 0)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_limit_val - v_current_usage,
    'plan_code', v_plan->>'plan_code'
  );
END;
$$;
