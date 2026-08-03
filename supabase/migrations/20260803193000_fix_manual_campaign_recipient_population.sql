CREATE OR REPLACE FUNCTION public.pe_populate_campaign_recipients(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_filtros jsonb;
  v_manual_only boolean := false;
  v_inserted int := 0;
  v_already int := 0;
  v_total int := 0;
BEGIN
  SELECT * INTO v_campaign
  FROM public.orbit_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada: %', p_campaign_id;
  END IF;

  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR get_user_empresa_id(auth.uid()) = v_campaign.empresa_id
  ) THEN
    RAISE EXCEPTION 'Não autorizado para esta campanha';
  END IF;

  v_filtros := COALESCE(v_campaign.filtros_json, '{}'::jsonb);
  v_manual_only := (
    COALESCE(jsonb_array_length(v_filtros->'selected_prospect_ids'), 0) > 0
    OR COALESCE(jsonb_array_length(v_filtros->'selected_group_ids'), 0) > 0
  ) AND jsonb_strip_nulls(v_filtros - 'selected_prospect_ids' - 'selected_group_ids') = '{}'::jsonb;

  WITH manual_ids AS (
    SELECT value::uuid AS prospect_id
    FROM jsonb_array_elements_text(COALESCE(v_filtros->'selected_prospect_ids', '[]'::jsonb))
    UNION
    SELECT unnest(g.prospect_ids) AS prospect_id
    FROM public.orbit_send_groups g
    WHERE g.empresa_id = v_campaign.empresa_id
      AND g.id IN (
        SELECT value::uuid
        FROM jsonb_array_elements_text(COALESCE(v_filtros->'selected_group_ids', '[]'::jsonb))
      )
  ),
  manual_eligible AS (
    SELECT
      p.id AS prospect_id,
      p.email_principal,
      COALESCE(p.whatsapp, p.telefone) AS telefone
    FROM public.orbit_prospects p
    JOIN manual_ids m ON m.prospect_id = p.id
    WHERE v_manual_only
      AND p.empresa_id = v_campaign.empresa_id
      AND p.deleted_at IS NULL
      AND (
        v_campaign.canal <> 'email'
        OR (
          p.email_principal IS NOT NULL
          AND p.email_principal <> ''
          AND COALESCE(p.optout_email, false) = false
        )
      )
      AND (
        v_campaign.canal = 'email'
        OR (
          COALESCE(p.whatsapp, p.telefone) IS NOT NULL
          AND COALESCE(p.whatsapp, p.telefone) <> ''
          AND COALESCE(p.optout_whatsapp, false) = false
        )
      )
  ),
  preview_eligible AS (
    SELECT
      p.prospect_id,
      p.email_principal,
      COALESCE(p.whatsapp, p.telefone) AS telefone
    FROM public.preview_campaign_recipients(
      v_campaign.empresa_id,
      v_campaign.canal,
      v_filtros,
      1,
      2147483647
    ) p
    WHERE NOT v_manual_only
  ),
  eligible AS (
    SELECT * FROM manual_eligible
    UNION
    SELECT * FROM preview_eligible
  ),
  ins AS (
    INSERT INTO public.orbit_campaign_recipients (
      campaign_id,
      empresa_id,
      prospect_id,
      email,
      telefone,
      status
    )
    SELECT
      p_campaign_id,
      v_campaign.empresa_id,
      e.prospect_id,
      e.email_principal,
      e.telefone,
      'pendente'
    FROM eligible e
    ON CONFLICT (campaign_id, prospect_id)
      WHERE campaign_id IS NOT NULL AND prospect_id IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  SELECT count(*) INTO v_total
  FROM public.orbit_campaign_recipients
  WHERE campaign_id = p_campaign_id;

  v_already := GREATEST(v_total - v_inserted, 0);

  UPDATE public.orbit_campaigns
  SET total_destinatarios = v_total, updated_at = now()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'already_present', v_already,
    'total', v_total,
    'manual_only', v_manual_only
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pe_populate_campaign_recipients(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.pe_populate_campaign_recipients(uuid) TO authenticated;
