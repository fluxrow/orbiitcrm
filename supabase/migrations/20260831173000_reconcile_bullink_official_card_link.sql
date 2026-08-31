BEGIN;

DO $$
DECLARE
  v_empresa constant uuid := '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';
  v_official_link constant text := 'https://link.infinitepay.io/albuquerqueadsltda/VC1D-JKIVWAm1tg-6500,00';
  v_cfg public.orbit_ai_config;
  v_roteiro text;
BEGIN
  SELECT *
    INTO v_cfg
    FROM public.orbit_ai_config
   WHERE empresa_id = v_empresa
   FOR UPDATE;

  IF v_cfg.id IS NULL THEN
    RAISE EXCEPTION 'orbit_ai_config nao encontrada para o Bullink';
  END IF;

  v_roteiro := coalesce(v_cfg.prompt_roteiro, '');
  v_roteiro := replace(
    v_roteiro,
    'https://pay.hypercash.com.br/pt/checkout/043ec27e-a362-4d27-82c3-f66f61b867bb',
    v_official_link
  );
  v_roteiro := replace(
    v_roteiro,
    'https://pay.hypercash.com.br/pt/payment-link/043ec27e-a362-4d27-82c3-f66f61b867bb',
    v_official_link
  );

  IF position('hypercash' in lower(v_roteiro)) > 0 THEN
    RAISE EXCEPTION 'link legado ainda presente no roteiro do Bullink';
  END IF;

  IF position(v_official_link in v_roteiro) = 0 THEN
    RAISE EXCEPTION 'link oficial nao encontrado no roteiro reconciliado';
  END IF;

  IF v_roteiro IS DISTINCT FROM v_cfg.prompt_roteiro THEN
    INSERT INTO public.orbit_quarantine_backups(
      empresa_id, batch_label, entity_type, entity_id, snapshot
    )
    VALUES (
      v_empresa,
      'bullink-card-link-reconcile-20260831',
      'orbit_ai_config',
      v_cfg.id,
      to_jsonb(v_cfg)
    );

    UPDATE public.orbit_ai_config
       SET prompt_roteiro = v_roteiro,
           updated_at = now()
     WHERE id = v_cfg.id;

    INSERT INTO public.orbit_audit_log(
      empresa_id, user_id, acao, entidade, entidade_id, detalhes
    )
    VALUES (
      v_empresa,
      NULL,
      'bullink_official_card_link_reconciled',
      'orbit_ai_config',
      v_cfg.id,
      jsonb_build_object(
        'source', 'ultra_review_20260831',
        'legacy_provider_removed', true,
        'official_provider', 'infinitepay',
        'tenant_scoped', true
      )
    );
  END IF;
END $$;

COMMIT;
