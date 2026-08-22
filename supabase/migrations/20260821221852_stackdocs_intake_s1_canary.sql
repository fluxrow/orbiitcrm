-- StackDocs -> Orbit intake S1.
-- This migration is additive and canary-only. It creates no connection and no
-- code path capable of mutating prospects, deals, flows, AI, agenda or messages.

BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT
  e.id,
  flag.feature_key,
  CASE
    WHEN flag.feature_key = 'stackdocs_integration_v1' AND e.slug = 'fluxrow' THEN true
    ELSE false
  END,
  CASE
    WHEN flag.feature_key = 'stackdocs_integration_v1' AND e.slug = 'fluxrow' THEN now()
    ELSE NULL
  END,
  jsonb_build_object(
    'canary', e.slug = 'fluxrow',
    'phase', 'S1',
    'mode', CASE
      WHEN flag.feature_key = 'stackdocs_integration_v1' AND e.slug = 'fluxrow' THEN 'shadow'
      ELSE 'disabled'
    END
  )
FROM public.orbit_empresas e
CROSS JOIN (
  VALUES
    ('stackdocs_integration_v1'::text),
    ('stackdocs_integration_apply_v1'::text)
) AS flag(feature_key)
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE
  v_invalid text[];
BEGIN
  SELECT array_agg(expected.slug || ':' || expected.feature_key ORDER BY expected.slug, expected.feature_key)
  INTO v_invalid
  FROM (
    VALUES
      ('fluxrow'::text, 'stackdocs_integration_v1'::text, true),
      ('fluxrow'::text, 'stackdocs_integration_apply_v1'::text, false),
      ('bullink-negocios'::text, 'stackdocs_integration_v1'::text, false),
      ('bullink-negocios'::text, 'stackdocs_integration_apply_v1'::text, false),
      ('fabrica-de-pesquisadores'::text, 'stackdocs_integration_v1'::text, false),
      ('fabrica-de-pesquisadores'::text, 'stackdocs_integration_apply_v1'::text, false),
      ('viver-semijoias'::text, 'stackdocs_integration_v1'::text, false),
      ('viver-semijoias'::text, 'stackdocs_integration_apply_v1'::text, false)
  ) AS expected(slug, feature_key, enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug = expected.slug
  LEFT JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = expected.feature_key
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'STACKDOCS_S1_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE TABLE public.orbit_external_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  provider text NOT NULL,
  public_connection_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  entitlement_key text NOT NULL DEFAULT 'stackdocs_integration',
  secret_env_key text NOT NULL,
  active_secret_version integer NOT NULL DEFAULT 1,
  previous_secret_env_key text NULL,
  previous_secret_valid_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_external_connections_provider_chk
    CHECK (provider = 'stackdocs'),
  CONSTRAINT orbit_external_connections_public_id_chk
    CHECK (
      char_length(public_connection_id) BETWEEN 8 AND 128
      AND public_connection_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
  CONSTRAINT orbit_external_connections_status_chk
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT orbit_external_connections_secret_ref_chk
    CHECK (secret_env_key ~ '^STACKDOCS_ORBIT_V1_[A-Z0-9_]+_SECRET$'),
  CONSTRAINT orbit_external_connections_previous_secret_ref_chk
    CHECK (
      previous_secret_env_key IS NULL
      OR previous_secret_env_key ~ '^STACKDOCS_ORBIT_V1_[A-Z0-9_]+_SECRET$'
    ),
  CONSTRAINT orbit_external_connections_secret_rotation_chk
    CHECK (
      (previous_secret_env_key IS NULL AND previous_secret_valid_until IS NULL)
      OR (previous_secret_env_key IS NOT NULL AND previous_secret_valid_until IS NOT NULL)
    ),
  UNIQUE (public_connection_id),
  UNIQUE (empresa_id, provider)
);

CREATE INDEX orbit_external_connections_tenant_status_idx
  ON public.orbit_external_connections (empresa_id, status);

COMMENT ON TABLE public.orbit_external_connections IS
  'Server-owned external integration connections. Contains environment-secret references, never secret values.';

CREATE TABLE public.orbit_integration_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.orbit_external_connections(id) ON DELETE RESTRICT,
  event_id text NOT NULL,
  event_type text NOT NULL,
  schema_version text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_hash text NOT NULL,
  sanitized_payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'validated',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text NULL,
  processed_at timestamptz NULL,
  CONSTRAINT orbit_integration_inbox_event_id_chk
    CHECK (char_length(event_id) BETWEEN 8 AND 128),
  CONSTRAINT orbit_integration_inbox_payload_hash_chk
    CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT orbit_integration_inbox_status_chk
    CHECK (status IN ('received', 'validated', 'processed', 'failed', 'dead')),
  CONSTRAINT orbit_integration_inbox_attempt_count_chk
    CHECK (attempt_count BETWEEN 0 AND 100),
  UNIQUE (connection_id, event_id)
);

CREATE INDEX orbit_integration_inbox_rate_idx
  ON public.orbit_integration_inbox (connection_id, received_at DESC);
CREATE INDEX orbit_integration_inbox_tenant_status_idx
  ON public.orbit_integration_inbox (empresa_id, status, received_at);

COMMENT ON TABLE public.orbit_integration_inbox IS
  'Immutable, tenant-scoped durable receipts for external events. No operational CRM trigger is attached.';

CREATE OR REPLACE FUNCTION public.orbit_integration_inbox_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTEGRATION_RECEIPT_DELETE_FORBIDDEN';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
    OR NEW.connection_id IS DISTINCT FROM OLD.connection_id
    OR NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    OR NEW.received_at IS DISTINCT FROM OLD.received_at
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.sanitized_payload IS DISTINCT FROM OLD.sanitized_payload THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'INTEGRATION_RECEIPT_IMMUTABLE_FIELDS';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER orbit_integration_inbox_immutable_guard
BEFORE UPDATE OR DELETE ON public.orbit_integration_inbox
FOR EACH ROW EXECUTE FUNCTION public.orbit_integration_inbox_immutable_guard();

REVOKE ALL ON FUNCTION public.orbit_integration_inbox_immutable_guard()
  FROM PUBLIC, anon, authenticated;

CREATE TABLE public.orbit_integration_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id uuid NOT NULL UNIQUE REFERENCES public.orbit_integration_inbox(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  mapping_version_id uuid NULL,
  normalized_payload jsonb NOT NULL,
  proposed_operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  apply_status text NOT NULL DEFAULT 'shadow_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_integration_projections_apply_status_chk
    CHECK (apply_status IN ('shadow_only', 'eligible', 'applied', 'rejected')),
  CONSTRAINT orbit_integration_projections_operations_chk
    CHECK (jsonb_typeof(proposed_operations) = 'array')
);

CREATE INDEX orbit_integration_projections_tenant_idx
  ON public.orbit_integration_projections (empresa_id, created_at DESC);

COMMENT ON TABLE public.orbit_integration_projections IS
  'Shadow-only S1 projections. No trigger or grant can apply these proposals to operational tables.';

ALTER TABLE public.orbit_external_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_external_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_integration_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_integration_inbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_integration_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_integration_projections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.orbit_external_connections,
  public.orbit_integration_inbox,
  public.orbit_integration_projections
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.orbit_external_connections,
  public.orbit_integration_inbox,
  public.orbit_integration_projections
TO service_role;

CREATE OR REPLACE FUNCTION public.orbit_stackdocs_accept_event(
  p_connection_id uuid,
  p_payload_hash text,
  p_payload jsonb,
  p_rate_limit integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_connection public.orbit_external_connections%ROWTYPE;
  v_existing public.orbit_integration_inbox%ROWTYPE;
  v_receipt_id uuid;
  v_event_id text := p_payload->>'event_id';
  v_event_type text := p_payload->>'event_type';
  v_schema_version text := p_payload->>'schema_version';
  v_correlation_id text := p_payload->>'correlation_id';
  v_occurred_at timestamptz;
  v_rate_limit integer := least(greatest(coalesce(p_rate_limit, 60), 1), 600);
  v_recent_count bigint;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SERVICE_ROLE_REQUIRED';
  END IF;

  SELECT * INTO v_connection
  FROM public.orbit_external_connections c
  WHERE c.id = p_connection_id
    AND c.provider = 'stackdocs'
  FOR SHARE;

  IF NOT FOUND OR v_connection.status <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CONNECTION_NOT_ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_feature_flags f
    WHERE f.empresa_id = v_connection.empresa_id
      AND f.feature_key = 'stackdocs_integration_v1'
      AND f.enabled = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STACKDOCS_FEATURE_DISABLED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orbit_feature_flags f
    WHERE f.empresa_id = v_connection.empresa_id
      AND f.feature_key = 'stackdocs_integration_apply_v1'
      AND f.enabled = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'S1_APPLY_FLAG_MUST_REMAIN_DISABLED';
  END IF;

  IF p_payload->>'connection_id' IS DISTINCT FROM v_connection.public_connection_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONNECTION_ID_MISMATCH';
  END IF;
  IF v_event_type <> 'stackdocs.submission.completed' OR v_schema_version <> '1.0' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTRACT_VERSION_NOT_SUPPORTED';
  END IF;
  IF p_payload_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PAYLOAD_HASH';
  END IF;

  BEGIN
    v_occurred_at := (p_payload->>'occurred_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_OCCURRED_AT';
  END;

  SELECT * INTO v_existing
  FROM public.orbit_integration_inbox i
  WHERE i.connection_id = p_connection_id
    AND i.event_id = v_event_id;

  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'EVENT_ID_PAYLOAD_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'receipt_id', v_existing.id,
      'duplicate', true,
      'correlation_id', v_existing.correlation_id
    );
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM public.orbit_integration_inbox i
  WHERE i.connection_id = p_connection_id
    AND i.received_at >= now() - interval '1 minute';

  IF v_recent_count >= v_rate_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STACKDOCS_RATE_LIMITED';
  END IF;

  INSERT INTO public.orbit_integration_inbox (
    empresa_id, connection_id, event_id, event_type, schema_version,
    correlation_id, occurred_at, payload_hash, sanitized_payload, status
  ) VALUES (
    v_connection.empresa_id, p_connection_id, v_event_id, v_event_type,
    v_schema_version, v_correlation_id, v_occurred_at, p_payload_hash,
    p_payload, 'validated'
  )
  ON CONFLICT (connection_id, event_id) DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.orbit_integration_inbox i
    WHERE i.connection_id = p_connection_id
      AND i.event_id = v_event_id;
    IF v_existing.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'EVENT_ID_PAYLOAD_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'receipt_id', v_existing.id,
      'duplicate', true,
      'correlation_id', v_existing.correlation_id
    );
  END IF;

  INSERT INTO public.orbit_integration_projections (
    inbox_id, empresa_id, normalized_payload, proposed_operations,
    validation_evidence, apply_status
  ) VALUES (
    v_receipt_id,
    v_connection.empresa_id,
    jsonb_build_object(
      'subject', p_payload->'subject',
      'lead', p_payload#>'{payload,lead}',
      'attribution', p_payload#>'{payload,attribution}',
      'answers_count', (
        SELECT count(*)
        FROM jsonb_object_keys(coalesce(p_payload#>'{payload,answers}', '{}'::jsonb))
      ),
      'attachments_count', jsonb_array_length(coalesce(p_payload#>'{payload,attachments}', '[]'::jsonb))
    ),
    jsonb_build_array(jsonb_build_object(
      'operation', 'upsert_prospect_preview',
      'mode', 'shadow',
      'executable', false
    )),
    jsonb_build_object(
      'schema_version', v_schema_version,
      'payload_hash', p_payload_hash,
      'hmac_verified_at_edge', true,
      'apply_flag_verified_disabled', true
    ),
    'shadow_only'
  );

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'duplicate', false,
    'correlation_id', v_correlation_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_stackdocs_accept_event(uuid, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_stackdocs_accept_event(uuid, text, jsonb, integer)
  TO service_role;

COMMIT;
