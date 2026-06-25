
-- ============================================================
-- Item 1 — Documento unificado (CPF/CNPJ)
-- Estratégia não-destrutiva: novas colunas + backfill, mantendo cnpj legado.
-- ============================================================

-- 1. clientes: documento + tipo_documento
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS documento text,
  ADD COLUMN IF NOT EXISTS tipo_documento text CHECK (tipo_documento IS NULL OR tipo_documento IN ('PF','PJ'));

UPDATE public.clientes
SET documento = regexp_replace(cnpj, '[^0-9]', '', 'g'),
    tipo_documento = CASE
      WHEN length(regexp_replace(cnpj,'[^0-9]','','g')) = 11 THEN 'PF'
      WHEN length(regexp_replace(cnpj,'[^0-9]','','g')) = 14 THEN 'PJ'
      ELSE NULL
    END
WHERE cnpj IS NOT NULL AND cnpj <> '' AND documento IS NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_documento
  ON public.clientes(organization_id, documento) WHERE documento IS NOT NULL;

-- 2. orbit_prospects: tipo_documento (cnpj_cpf já existe)
ALTER TABLE public.orbit_prospects
  ADD COLUMN IF NOT EXISTS tipo_documento text CHECK (tipo_documento IS NULL OR tipo_documento IN ('PF','PJ'));

UPDATE public.orbit_prospects
SET tipo_documento = CASE
      WHEN length(regexp_replace(cnpj_cpf,'[^0-9]','','g')) = 11 THEN 'PF'
      WHEN length(regexp_replace(cnpj_cpf,'[^0-9]','','g')) = 14 THEN 'PJ'
      ELSE NULL
    END
WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf <> '' AND tipo_documento IS NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_prospects_documento
  ON public.orbit_prospects(empresa_id, cnpj_cpf) WHERE cnpj_cpf IS NOT NULL;

-- 3. Função de validação CPF/CNPJ com dígito verificador
CREATE OR REPLACE FUNCTION public.validate_documento(p_doc text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
  n int;
  i int;
  soma int;
  resto int;
  dig1 int;
  dig2 int;
  peso int;
BEGIN
  d := regexp_replace(COALESCE(p_doc,''), '[^0-9]', '', 'g');
  n := length(d);

  IF n NOT IN (11, 14) THEN
    RETURN jsonb_build_object('valid', false, 'tipo', NULL, 'normalized', d, 'error', 'invalid_length');
  END IF;

  -- Rejeita sequências repetidas (11111111111 etc.)
  IF d ~ ('^(' || substr(d,1,1) || '){' || n || '}$') THEN
    RETURN jsonb_build_object('valid', false, 'tipo', NULL, 'normalized', d, 'error', 'repeated_digits');
  END IF;

  IF n = 11 THEN
    -- CPF: dois DVs
    soma := 0;
    FOR i IN 1..9 LOOP
      soma := soma + (substr(d,i,1)::int) * (11 - i);
    END LOOP;
    resto := (soma * 10) % 11;
    IF resto = 10 THEN resto := 0; END IF;
    dig1 := resto;
    IF dig1 <> substr(d,10,1)::int THEN
      RETURN jsonb_build_object('valid', false, 'tipo', 'PF', 'normalized', d, 'error', 'invalid_dv');
    END IF;

    soma := 0;
    FOR i IN 1..10 LOOP
      soma := soma + (substr(d,i,1)::int) * (12 - i);
    END LOOP;
    resto := (soma * 10) % 11;
    IF resto = 10 THEN resto := 0; END IF;
    dig2 := resto;
    IF dig2 <> substr(d,11,1)::int THEN
      RETURN jsonb_build_object('valid', false, 'tipo', 'PF', 'normalized', d, 'error', 'invalid_dv');
    END IF;

    RETURN jsonb_build_object('valid', true, 'tipo', 'PF', 'normalized', d);
  ELSE
    -- CNPJ: dois DVs com pesos 5..2,9..2 e 6..2,9..2
    soma := 0;
    peso := 5;
    FOR i IN 1..12 LOOP
      soma := soma + (substr(d,i,1)::int) * peso;
      peso := peso - 1;
      IF peso < 2 THEN peso := 9; END IF;
    END LOOP;
    resto := soma % 11;
    dig1 := CASE WHEN resto < 2 THEN 0 ELSE 11 - resto END;
    IF dig1 <> substr(d,13,1)::int THEN
      RETURN jsonb_build_object('valid', false, 'tipo', 'PJ', 'normalized', d, 'error', 'invalid_dv');
    END IF;

    soma := 0;
    peso := 6;
    FOR i IN 1..13 LOOP
      soma := soma + (substr(d,i,1)::int) * peso;
      peso := peso - 1;
      IF peso < 2 THEN peso := 9; END IF;
    END LOOP;
    resto := soma % 11;
    dig2 := CASE WHEN resto < 2 THEN 0 ELSE 11 - resto END;
    IF dig2 <> substr(d,14,1)::int THEN
      RETURN jsonb_build_object('valid', false, 'tipo', 'PJ', 'normalized', d, 'error', 'invalid_dv');
    END IF;

    RETURN jsonb_build_object('valid', true, 'tipo', 'PJ', 'normalized', d);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_documento(text) TO anon, authenticated, service_role;
