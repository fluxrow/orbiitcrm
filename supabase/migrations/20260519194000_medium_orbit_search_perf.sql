ALTER TABLE public.orbit_prospects
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.update_prospect_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('portuguese',
    coalesce(NEW.nome_razao, '') || ' ' ||
    coalesce(NEW.nome_fantasia, '') || ' ' ||
    coalesce(NEW.email_principal, '') || ' ' ||
    coalesce(NEW.cidade, '') || ' ' ||
    coalesce(NEW.segmento, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_prospect_search_vector ON public.orbit_prospects;

CREATE TRIGGER tg_prospect_search_vector
  BEFORE INSERT OR UPDATE ON public.orbit_prospects
  FOR EACH ROW EXECUTE FUNCTION public.update_prospect_search_vector();

UPDATE public.orbit_prospects
SET search_vector = to_tsvector('portuguese',
  coalesce(nome_razao, '') || ' ' ||
  coalesce(nome_fantasia, '') || ' ' ||
  coalesce(email_principal, '') || ' ' ||
  coalesce(cidade, '') || ' ' ||
  coalesce(segmento, '')
);

CREATE INDEX IF NOT EXISTS idx_orbit_prospects_search
  ON public.orbit_prospects
  USING GIN(search_vector);
