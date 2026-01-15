-- Add missing columns to orbit_zapi_config table
ALTER TABLE public.orbit_zapi_config 
ADD COLUMN IF NOT EXISTS nome_instancia TEXT,
ADD COLUMN IF NOT EXISTS numero_origem TEXT;