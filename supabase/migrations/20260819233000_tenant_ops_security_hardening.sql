-- Security hardening required before Tenant Operations Center phase 1 rollout.
-- This migration changes privileges and RLS policy metadata only; it does not
-- mutate tenant rows or operational queue state.

-- PostgreSQL privileges are additive. Revoking only column-level SELECT would
-- not override an existing table-level SELECT grant, so remove the broad grant
-- first and restore authenticated access only to non-secret columns.
REVOKE SELECT ON TABLE public.orbit_google_tokens FROM PUBLIC, anon, authenticated;
REVOKE SELECT (access_token, refresh_token)
  ON TABLE public.orbit_google_tokens FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  empresa_id,
  user_id,
  google_email,
  expires_at,
  scope,
  calendar_id,
  timezone,
  created_at,
  updated_at,
  availability_start,
  availability_end,
  booking_min_notice_minutes,
  booking_max_horizon_days,
  availability_break_start,
  availability_break_end
) ON TABLE public.orbit_google_tokens TO authenticated;

REVOKE SELECT ON TABLE public.orbit_zapi_config FROM PUBLIC, anon, authenticated;
REVOKE SELECT (token, client_token)
  ON TABLE public.orbit_zapi_config FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  instance_id,
  ativo,
  webhook_url,
  created_at,
  updated_at,
  empresa_id,
  nome_instancia,
  numero_origem,
  notificar_enviadas_por_mim,
  token_secret_id,
  client_token_secret_id,
  envio_real_liberado,
  canary_phone_numbers,
  instance_offline,
  offline_since,
  offline_reason,
  last_status_check_at,
  last_online_at,
  send_block_until,
  offline_alert_sent_at,
  canary_mode_enabled
) ON TABLE public.orbit_zapi_config TO authenticated;

ALTER POLICY "Users can update own empresa conversas"
  ON public.orbit_conversas
  TO authenticated
  USING (empresa_id = public.get_user_empresa_id((SELECT auth.uid())))
  WITH CHECK (
    empresa_id = (((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'empresa_id'::text)::uuid
  );

ALTER POLICY "Users can view own empresa audit log"
  ON public.orbit_audit_log TO authenticated;

ALTER POLICY "Users can insert own empresa audit log"
  ON public.orbit_audit_log TO authenticated;

ALTER POLICY "Super admin can manage all audit logs"
  ON public.orbit_audit_log TO authenticated;
