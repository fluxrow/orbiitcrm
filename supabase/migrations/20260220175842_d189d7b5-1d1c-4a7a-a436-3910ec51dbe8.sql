
-- Fix: drop the constraint instead of the index
ALTER TABLE public.orbit_empresas DROP CONSTRAINT IF EXISTS orbit_empresas_cnpj_key;
