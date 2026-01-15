ALTER TABLE public.orbit_resend_config 
ADD COLUMN IF NOT EXISTS api_key text,
ADD COLUMN IF NOT EXISTS dominio_verificado text,
ADD COLUMN IF NOT EXISTS email_teste text;

COMMENT ON COLUMN public.orbit_resend_config.api_key IS 'API Key do Resend';
COMMENT ON COLUMN public.orbit_resend_config.dominio_verificado IS 'Domínio verificado no Resend';
COMMENT ON COLUMN public.orbit_resend_config.email_teste IS 'Email para testes de conexão';