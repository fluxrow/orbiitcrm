-- O deploy do gate não libera envios. A ativação do canário é uma operação
-- manual posterior à validação, estritamente limitada ao tenant Viver.
UPDATE public.orbit_zapi_config
SET canary_mode_enabled = false,
    updated_at = now()
WHERE empresa_id = '36f26579-66ad-4ef1-9788-141e4c727232';
