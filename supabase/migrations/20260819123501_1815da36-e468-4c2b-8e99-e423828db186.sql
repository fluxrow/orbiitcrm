CREATE OR REPLACE FUNCTION public.orbit_mensagens_default_sender_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type IS NULL THEN
    NEW.sender_type := CASE WHEN NEW.direcao = 'IN' THEN 'lead' ELSE 'ai' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orbit_mensagens_default_sender_type ON public.orbit_mensagens;
CREATE TRIGGER trg_orbit_mensagens_default_sender_type
  BEFORE INSERT ON public.orbit_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.orbit_mensagens_default_sender_type();