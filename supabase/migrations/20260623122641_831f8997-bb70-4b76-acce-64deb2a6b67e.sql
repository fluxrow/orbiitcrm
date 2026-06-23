DROP INDEX IF EXISTS public.idx_prospect_telefone;
CREATE UNIQUE INDEX idx_prospect_telefone_empresa ON public.orbit_prospects (empresa_id, telefone) WHERE telefone IS NOT NULL;