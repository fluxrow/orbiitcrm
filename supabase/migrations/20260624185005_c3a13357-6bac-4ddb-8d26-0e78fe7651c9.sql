
-- Status enum
DO $$ BEGIN
  CREATE TYPE public.orbit_onboarding_status AS ENUM ('rascunho','enviado','em_andamento','concluido','revisado','arquivado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.orbit_client_onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.orbit_onboarding_status NOT NULL DEFAULT 'rascunho',
  cliente_nome text,
  cliente_email text,
  cliente_empresa text,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  implementation_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  sent_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_saved_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orbit_onboardings_empresa ON public.orbit_client_onboardings(empresa_id);
CREATE INDEX IF NOT EXISTS idx_orbit_onboardings_token ON public.orbit_client_onboardings(public_token);
CREATE INDEX IF NOT EXISTS idx_orbit_onboardings_status ON public.orbit_client_onboardings(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_client_onboardings TO authenticated;
GRANT ALL ON public.orbit_client_onboardings TO service_role;

ALTER TABLE public.orbit_client_onboardings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants read own onboardings"
  ON public.orbit_client_onboardings FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.get_user_empresa_id(auth.uid()) = empresa_id
  );

CREATE POLICY "tenants insert own onboardings"
  ON public.orbit_client_onboardings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.get_user_empresa_id(auth.uid()) = empresa_id
  );

CREATE POLICY "tenants update own onboardings"
  ON public.orbit_client_onboardings FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.get_user_empresa_id(auth.uid()) = empresa_id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.get_user_empresa_id(auth.uid()) = empresa_id
  );

CREATE POLICY "tenants delete own onboardings"
  ON public.orbit_client_onboardings FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.get_user_empresa_id(auth.uid()) = empresa_id
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_orbit_onboardings_updated_at ON public.orbit_client_onboardings;
CREATE TRIGGER trg_orbit_onboardings_updated_at
  BEFORE UPDATE ON public.orbit_client_onboardings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public RPCs (token-based, no auth required)
CREATE OR REPLACE FUNCTION public.get_onboarding_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.orbit_client_onboardings%ROWTYPE;
  v_empresa_nome text;
BEGIN
  SELECT * INTO v_row FROM public.orbit_client_onboardings WHERE public_token = p_token;
  IF NOT FOUND OR v_row.archived THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT nome INTO v_empresa_nome FROM public.orbit_empresas WHERE id = v_row.empresa_id;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', v_row.id,
      'status', v_row.status,
      'cliente_nome', v_row.cliente_nome,
      'cliente_email', v_row.cliente_email,
      'cliente_empresa', v_row.cliente_empresa,
      'responses', v_row.responses,
      'sent_at', v_row.sent_at,
      'completed_at', v_row.completed_at,
      'last_saved_at', v_row.last_saved_at,
      'empresa_nome', v_empresa_nome
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_onboarding_responses(p_token text, p_responses jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status public.orbit_onboarding_status;
BEGIN
  SELECT id, status INTO v_id, v_status
  FROM public.orbit_client_onboardings
  WHERE public_token = p_token AND archived = false;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status IN ('concluido','revisado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  UPDATE public.orbit_client_onboardings
  SET responses = COALESCE(p_responses, '{}'::jsonb),
      last_saved_at = now(),
      started_at = COALESCE(started_at, now()),
      status = CASE WHEN status = 'enviado' THEN 'em_andamento'::public.orbit_onboarding_status ELSE status END
  WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('id', v_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_onboarding(p_token text, p_responses jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.orbit_client_onboardings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.orbit_client_onboardings WHERE public_token = p_token AND archived = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status IN ('concluido','revisado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  UPDATE public.orbit_client_onboardings
  SET responses = COALESCE(p_responses, v_row.responses),
      status = 'concluido',
      completed_at = now(),
      last_saved_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', v_row.id, 'empresa_id', v_row.empresa_id, 'cliente_email', v_row.cliente_email
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_responses(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_onboarding(text, jsonb) TO anon, authenticated;
