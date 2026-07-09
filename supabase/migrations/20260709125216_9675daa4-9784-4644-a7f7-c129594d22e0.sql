-- Trava global/por tenant: envio real Z-API só se explicitamente liberado
ALTER TABLE public.orbit_zapi_config
  ADD COLUMN IF NOT EXISTS envio_real_liberado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orbit_zapi_config.envio_real_liberado IS
  'Trava de segurança: quando false, sendZapi retorna erro e nenhuma mensagem real é enviada. Deve ser ativado manualmente por tenant após homologação.';