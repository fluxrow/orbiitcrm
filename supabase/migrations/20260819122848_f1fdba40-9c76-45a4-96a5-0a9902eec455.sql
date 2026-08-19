-- 1) Autoria aditiva em orbit_mensagens
ALTER TABLE public.orbit_mensagens
  ADD COLUMN IF NOT EXISTS sender_type text,
  ADD COLUMN IF NOT EXISTS sent_by_user_id uuid;

ALTER TABLE public.orbit_mensagens
  DROP CONSTRAINT IF EXISTS orbit_mensagens_sender_type_check;
ALTER TABLE public.orbit_mensagens
  ADD CONSTRAINT orbit_mensagens_sender_type_check
  CHECK (sender_type IS NULL OR sender_type IN ('lead','ai','human_orbit','human_phone','system'));

-- Backfill compatível: IN = lead, OUT = ai (origem histórica padrão do Orbit)
UPDATE public.orbit_mensagens
   SET sender_type = CASE WHEN direcao = 'IN' THEN 'lead' ELSE 'ai' END
 WHERE sender_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_mensagens_sender_type
  ON public.orbit_mensagens (conversa_id, sender_type);

-- 2) Mapeamento tenant-scoped LID -> telefone/prospect/conversa
CREATE TABLE IF NOT EXISTS public.orbit_whatsapp_lid_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  lid text NOT NULL,
  telefone text,
  prospect_id uuid REFERENCES public.orbit_prospects(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.orbit_conversas(id) ON DELETE SET NULL,
  instance_id text,
  resolved_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_whatsapp_lid_map_unique UNIQUE (empresa_id, lid)
);

GRANT SELECT ON public.orbit_whatsapp_lid_map TO authenticated;
GRANT ALL ON public.orbit_whatsapp_lid_map TO service_role;

ALTER TABLE public.orbit_whatsapp_lid_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lid_map_select_tenant" ON public.orbit_whatsapp_lid_map;
CREATE POLICY "lid_map_select_tenant" ON public.orbit_whatsapp_lid_map
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR empresa_id = get_user_empresa_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_memberships m
       WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_whatsapp_lid_map.empresa_id
    )
  );

DROP POLICY IF EXISTS "lid_map_super_admin_all" ON public.orbit_whatsapp_lid_map;
CREATE POLICY "lid_map_super_admin_all" ON public.orbit_whatsapp_lid_map
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP TRIGGER IF EXISTS trg_lid_map_updated_at ON public.orbit_whatsapp_lid_map;
CREATE TRIGGER trg_lid_map_updated_at
  BEFORE UPDATE ON public.orbit_whatsapp_lid_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Devolução atômica humano -> IA
CREATE OR REPLACE FUNCTION public.orbit_release_conversa_to_ai(p_conversa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conversa public.orbit_conversas;
  v_is_super boolean;
  v_has_access boolean;
  v_modo boolean;
  v_cutoff timestamptz;
  v_ref timestamptz;
  v_ctx jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_conversa FROM public.orbit_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversa_not_found');
  END IF;

  v_is_super := has_role(v_uid, 'super_admin'::app_role) OR pe_is_super_admin(v_uid);
  v_has_access := v_is_super
    OR v_conversa.empresa_id = get_user_empresa_id(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_memberships m
       WHERE m.user_id = v_uid AND m.empresa_id = v_conversa.empresa_id
    );

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT modo_automatico, auto_reply_new_leads_from
    INTO v_modo, v_cutoff
    FROM public.orbit_ai_config
   WHERE empresa_id = v_conversa.empresa_id
   LIMIT 1;

  IF COALESCE(v_modo, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'automatic_mode_off');
  END IF;

  IF v_cutoff IS NOT NULL THEN
    v_ref := COALESCE(v_conversa.ultima_mensagem_at, v_conversa.created_at);
    IF v_ref IS NULL OR v_ref < v_cutoff THEN
      RETURN jsonb_build_object('ok', false, 'error', 'before_automation_cutoff');
    END IF;
  END IF;

  -- Normaliza somente o estado operacional de handoff; preserva demais chaves.
  v_ctx := COALESCE(v_conversa.ai_contexto, '{}'::jsonb);
  IF v_ctx ->> 'estado' = 'handoff' THEN
    v_ctx := v_ctx - 'estado';
  END IF;
  v_ctx := v_ctx - 'handoff_reason' - 'handoff_pending' - 'external_human_active';
  v_ctx := jsonb_set(
    v_ctx,
    '{last_ai_release}',
    jsonb_build_object('at', to_jsonb(now()), 'by', to_jsonb(v_uid)),
    true
  );

  UPDATE public.orbit_conversas
     SET human_talk = false,
         human_user_id = NULL,
         ai_processing = false,
         handoff_sent_at = NULL,
         ai_contexto = v_ctx,
         updated_at = now()
   WHERE id = p_conversa_id;

  -- Release não pode ressuscitar debounce antigo.
  UPDATE public.orbit_ai_reply_debounce
     SET status = 'canceled',
         last_error = 'released_to_ai',
         updated_at = now()
   WHERE conversa_id = p_conversa_id
     AND status IN ('pending', 'generating');

  RETURN jsonb_build_object('ok', true, 'conversa_id', p_conversa_id, 'released_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.orbit_release_conversa_to_ai(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orbit_release_conversa_to_ai(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.orbit_release_conversa_to_ai(uuid) TO authenticated;