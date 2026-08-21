-- Wave 4.3b hardening: create the campaign draft and materialize its
-- recipients in one transaction. Real dispatch remains outside this contract.
BEGIN;

CREATE OR REPLACE FUNCTION public.orbit_tenant_campaign_create_atomic_scoped(
  p_tenant_slug text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_expected_recipient_count integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_saved jsonb;
  v_populated jsonb;
  v_campaign_id uuid;
BEGIN
  IF jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PAYLOAD_OBJECT_REQUIRED';
  END IF;
  IF p_expected_recipient_count IS NOT NULL AND p_expected_recipient_count < 0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_EXPECTED_RECIPIENT_COUNT';
  END IF;

  -- Both calls participate in this function's transaction. Any population or
  -- count-validation error rolls back the draft, recipients and audit entries.
  v_saved := public.orbit_tenant_campaign_mutate_scoped(
    p_tenant_slug, 'save_draft', NULL, coalesce(p_payload, '{}'::jsonb)
  );
  v_campaign_id := nullif(v_saved #>> '{data,campaign,id}', '')::uuid;
  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='ATOMIC_CAMPAIGN_CREATE_FAILED';
  END IF;

  v_populated := public.orbit_tenant_campaign_mutate_scoped(
    p_tenant_slug,
    'populate_recipients',
    v_campaign_id,
    CASE
      WHEN p_expected_recipient_count IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('expected_recipient_count', p_expected_recipient_count)
    END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'campaign', v_populated #> '{data,campaign}',
      'recipient_result', v_populated #> '{data,recipient_result}'
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_campaign_create_atomic_scoped(text,jsonb,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_campaign_create_atomic_scoped(text,jsonb,integer)
  TO authenticated;

COMMENT ON FUNCTION public.orbit_tenant_campaign_create_atomic_scoped(text,jsonb,integer)
  IS 'Atomically creates a tenant-scoped campaign draft and materializes recipients; never dispatches.';

COMMIT;
