
-- Fix search_path for helper functions
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.normalize_email(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(trim(COALESCE(p, '')))
$$;

CREATE OR REPLACE FUNCTION public.normalize_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(
    lower(
      translate(
        COALESCE(p, ''),
        'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    '[^a-z0-9 ]', '', 'g'
  )
$$;

CREATE OR REPLACE FUNCTION public.extract_domain(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN NULL
    WHEN p LIKE '%@%' THEN split_part(p, '@', 2)
    ELSE regexp_replace(
      regexp_replace(p, '^https?://', ''),
      '^www\.', ''
    )
  END
$$;
