CREATE OR REPLACE FUNCTION public.orbit_campaigns_force_pending_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean := false;
BEGIN
  -- Processos internos (service_role / sem JWT de usuário) mantêm comportamento atual.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_is_privileged := public.pe_user_is_orbit_admin(v_uid)
      OR public.has_role(v_uid, 'super_admin'::public.app_role);
  EXCEPTION WHEN OTHERS THEN
    v_is_privileged := false;
  END;

  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  -- Membro comum: nunca pode nascer aprovada.
  NEW.aprovacao_status := 'pendente';
  NEW.aprovado_por := NULL;
  NEW.aprovado_em := NULL;
  IF NEW.status IS NULL OR NEW.status NOT IN ('rascunho', 'pendente_aprovacao', 'em_revisao') THEN
    NEW.status := 'rascunho';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orbit_campaigns_force_pending_approval ON public.orbit_campaigns;
CREATE TRIGGER trg_orbit_campaigns_force_pending_approval
BEFORE INSERT ON public.orbit_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.orbit_campaigns_force_pending_approval();