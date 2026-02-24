-- Add snapshot columns for historical integrity
ALTER TABLE public.oportunidade_itens
  ADD COLUMN IF NOT EXISTS produto_nome_snapshot text;

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS etapa_nome_snapshot text;

-- Trigger to auto-populate produto_nome_snapshot on insert
CREATE OR REPLACE FUNCTION public.snapshot_produto_nome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.produto_nome_snapshot IS NULL THEN
    SELECT nome INTO NEW.produto_nome_snapshot
    FROM public.produtos WHERE id = NEW.produto_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_produto_nome
  BEFORE INSERT ON public.oportunidade_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_produto_nome();

-- Trigger to auto-populate etapa_nome_snapshot on insert/update
CREATE OR REPLACE FUNCTION public.snapshot_etapa_nome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id OR TG_OP = 'INSERT' THEN
    SELECT nome INTO NEW.etapa_nome_snapshot
    FROM public.funil_etapas WHERE id = NEW.etapa_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_etapa_nome
  BEFORE INSERT OR UPDATE ON public.oportunidades
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_etapa_nome();

-- Backfill existing data
UPDATE public.oportunidade_itens oi
SET produto_nome_snapshot = p.nome
FROM public.produtos p
WHERE oi.produto_id = p.id AND oi.produto_nome_snapshot IS NULL;

UPDATE public.oportunidades o
SET etapa_nome_snapshot = fe.nome
FROM public.funil_etapas fe
WHERE o.etapa_id = fe.id AND o.etapa_nome_snapshot IS NULL;