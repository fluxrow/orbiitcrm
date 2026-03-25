CREATE OR REPLACE FUNCTION public.saas_get_empresa_plan(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'plan_code', p.code,
    'features', p.features,
    'limits', p.limits,
    'status', se.status,
    'trial_ends_at', se.trial_ends_at,
    'stripe_status', se.stripe_status,
    'billing_status', se.billing_status,
    'cancel_at_period_end', se.cancel_at_period_end,
    'current_period_end', se.current_period_end
  ) INTO v_result
  FROM saas_empresa se
  JOIN saas_plans p ON p.id = se.plan_id
  WHERE se.empresa_id = p_empresa_id;

  RETURN v_result;
END;
$$;