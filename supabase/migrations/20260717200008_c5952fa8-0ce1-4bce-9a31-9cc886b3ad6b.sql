CREATE TABLE IF NOT EXISTS public.orbit_zapi_send_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.orbit_empresas(id) ON DELETE SET NULL,
  function_name text NOT NULL,
  action text NOT NULL,
  blocked boolean NOT NULL DEFAULT false,
  block_reason text,
  zapi_config_id uuid,
  campaign_id uuid,
  prospect_id uuid,
  conversa_id uuid,
  mensagem_id uuid,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_zapi_send_audit_empresa_created_idx
  ON public.orbit_zapi_send_audit(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orbit_zapi_send_audit_blocked_idx
  ON public.orbit_zapi_send_audit(blocked, created_at DESC);

GRANT SELECT ON public.orbit_zapi_send_audit TO authenticated;
GRANT ALL ON public.orbit_zapi_send_audit TO service_role;

ALTER TABLE public.orbit_zapi_send_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orbit_zapi_send_audit_select_super_admin"
  ON public.orbit_zapi_send_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "orbit_zapi_send_audit_select_empresa"
  ON public.orbit_zapi_send_audit FOR SELECT
  TO authenticated
  USING (
    empresa_id IS NOT NULL
    AND public.user_has_empresa_access(empresa_id)
  );
