
-- 1) Novos campos storage_path (nullable)
ALTER TABLE public.orbit_mensagens ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.orbit_audio_library ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.pe_users ADD COLUMN IF NOT EXISTS signature_image_path text;

-- 2) Helper transitório para extrair o path do bucket orbit-media a partir de uma URL antiga.
--    Aceita tanto /object/public/orbit-media/... quanto /object/sign/orbit-media/...
CREATE OR REPLACE FUNCTION public._orbit_media_extract_path(_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  marker_pub text := '/storage/v1/object/public/orbit-media/';
  marker_sig text := '/storage/v1/object/sign/orbit-media/';
  idx int;
  raw text;
BEGIN
  IF _url IS NULL OR length(_url) = 0 THEN
    RETURN NULL;
  END IF;
  idx := position(marker_pub IN _url);
  IF idx > 0 THEN
    raw := substring(_url FROM idx + length(marker_pub));
  ELSE
    idx := position(marker_sig IN _url);
    IF idx > 0 THEN
      raw := substring(_url FROM idx + length(marker_sig));
    ELSE
      RETURN NULL;
    END IF;
  END IF;
  -- descartar querystring
  IF position('?' IN raw) > 0 THEN
    raw := split_part(raw, '?', 1);
  END IF;
  RETURN raw;
END;
$$;

-- 3) Backfill
UPDATE public.orbit_mensagens
   SET storage_path = public._orbit_media_extract_path(url_midia)
 WHERE storage_path IS NULL
   AND url_midia IS NOT NULL
   AND public._orbit_media_extract_path(url_midia) IS NOT NULL;

UPDATE public.orbit_audio_library
   SET storage_path = public._orbit_media_extract_path(url)
 WHERE storage_path IS NULL
   AND url IS NOT NULL
   AND public._orbit_media_extract_path(url) IS NOT NULL;

UPDATE public.pe_users
   SET signature_image_path = public._orbit_media_extract_path(signature_image_url)
 WHERE signature_image_path IS NULL
   AND signature_image_url IS NOT NULL
   AND public._orbit_media_extract_path(signature_image_url) IS NOT NULL;

-- 4) Descartar helper transitório
DROP FUNCTION public._orbit_media_extract_path(text);
