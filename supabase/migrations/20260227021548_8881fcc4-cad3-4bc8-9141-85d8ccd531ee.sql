ALTER TABLE public.orbit_resend_config ADD COLUMN IF NOT EXISTS reply_to_email text;

UPDATE public.orbit_resend_config SET reply_to_email = 'comercial@promotripcorporate.com' WHERE reply_to_email IS NULL;