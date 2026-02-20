
-- RPC 1: saas_get_empresa_plan
CREATE OR REPLACE FUNCTION public.saas_get_empresa_plan(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'plan_code', p.code,
    'features', p.features,
    'limits', p.limits,
    'status', se.status,
    'trial_ends_at', se.trial_ends_at
  ) INTO v_result
  FROM saas_empresa se
  JOIN saas_plans p ON p.id = se.plan_id
  WHERE se.empresa_id = p_empresa_id;

  RETURN v_result;
END;
$function$;

-- RPC 2: saas_can_use
CREATE OR REPLACE FUNCTION public.saas_can_use(
  p_empresa_id uuid,
  p_feature_code text,
  p_amount int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- 2) Check status
  IF v_status NOT IN ('active', 'trial') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'SUSPENDED', 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 3) Check trial expiry
  IF v_status = 'trial' AND v_trial_ends_at IS NOT NULL AND v_trial_ends_at < now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'TRIAL_EXPIRED', 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 4) Map feature_code to feature flag key
  v_feature_flag := CASE p_feature_code
    WHEN 'email_send' THEN 'email'
    WHEN 'whatsapp_send' THEN 'whatsapp'
    WHEN 'ig_send' THEN 'instagram'
    WHEN 'fb_send' THEN 'facebook'
    WHEN 'lead_search' THEN 'lead_finder'
    ELSE p_feature_code
  END;

  -- 5) Check feature flag
  IF NOT COALESCE((v_features->>v_feature_flag)::boolean, false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'FEATURE_DISABLED', 'plan_code', v_plan->>'plan_code');
  END IF;

  -- 6) Map feature_code to limit key and usage column
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

  -- 7) Get limit value
  v_limit_val := COALESCE((v_limits->>v_limit_key)::int, 0);

  -- 8) Get current period
  v_period := to_char(now(), 'YYYY-MM');

  -- 9) Upsert usage row
  INSERT INTO saas_usage_monthly (empresa_id, period)
  VALUES (p_empresa_id, v_period)
  ON CONFLICT (empresa_id, period) DO NOTHING;

  -- 10) Read current usage via dynamic approach
  EXECUTE format(
    'SELECT COALESCE(%I, 0) FROM saas_usage_monthly WHERE empresa_id = $1 AND period = $2',
    v_usage_col
  ) INTO v_current_usage USING p_empresa_id, v_period;

  -- 11) Check limit
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
$function$;

-- RPC 3: saas_increment_usage
CREATE OR REPLACE FUNCTION public.saas_increment_usage(
  p_empresa_id uuid,
  p_feature_code text,
  p_amount int DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usage_col text;
  v_period text;
BEGIN
  v_usage_col := CASE p_feature_code
    WHEN 'email_send' THEN 'email_sent'
    WHEN 'whatsapp_send' THEN 'whatsapp_sent'
    WHEN 'ig_send' THEN 'ig_sent'
    WHEN 'fb_send' THEN 'fb_sent'
    WHEN 'lead_search' THEN 'lead_search_calls'
    ELSE null
  END;

  IF v_usage_col IS NULL THEN
    RAISE EXCEPTION 'Unknown feature_code: %', p_feature_code;
  END IF;

  v_period := to_char(now(), 'YYYY-MM');

  -- Upsert + increment
  INSERT INTO saas_usage_monthly (empresa_id, period)
  VALUES (p_empresa_id, v_period)
  ON CONFLICT (empresa_id, period) DO NOTHING;

  EXECUTE format(
    'UPDATE saas_usage_monthly SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE empresa_id = $2 AND period = $3',
    v_usage_col, v_usage_col
  ) USING p_amount, p_empresa_id, v_period;
END;
$function$;
