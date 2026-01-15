-- Adicionar coluna para toggle de notificar mensagens próprias
ALTER TABLE public.orbit_zapi_config 
ADD COLUMN IF NOT EXISTS notificar_enviadas_por_mim BOOLEAN DEFAULT false;