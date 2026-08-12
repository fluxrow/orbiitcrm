DO $$
DECLARE
  v_empresa uuid := '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';
  v_cfg public.orbit_ai_config;
  v_regras text;
  v_old_price text := '- Preço: se o lead perguntar valor e cartão na mesma mensagem, apenas pergunte se prefere PIX à vista ou cartão parcelado. Nesta primeira resposta é proibido citar qualquer valor, parcela ou total, e proibido enviar link ou chave antes da escolha.';
  v_new_price text := '- Preço: informar valor NÃO é iniciar pagamento. Se o lead perguntar valor, preço, investimento, parcelamento ou cartão, responda o valor oficial no mesmo turno, em uma frase curta: Mentoria R$ 6.500,00 à vista no PIX ou 12x de R$ 642,44 no cartão; Curso Gravado R$ 997,00 à vista no PIX. Não pergunte a forma de pagamento antes de haver intenção real de fechar, pagar ou se inscrever, e nunca envie link ou chave antes de o lead escolher a forma.';
  v_old_card text := '- Depois que o lead escolher cartão, responda em uma única mensagem curta com "12x de R$ 642,44" e o link https://pay.hypercash.com.br/pt/payment-link/043ec27e-a362-4d27-82c3-f66f61b867bb. Sempre repita o valor da parcela junto do link e nunca cite total acumulado.';
  v_new_card text := '- Depois que o lead escolher cartão, responda em uma única mensagem curta com "12x de R$ 642,44" e o link oficial https://link.infinitepay.io/albuquerqueadsltda/VC1D-JKIVWAm1tg-6500,00. Este é o único link de cartão válido. Sempre repita o valor da parcela junto do link e nunca cite, calcule ou revele o total acumulado.';
BEGIN
  SELECT * INTO v_cfg FROM public.orbit_ai_config WHERE empresa_id = v_empresa;
  IF v_cfg.id IS NULL THEN
    RAISE EXCEPTION 'orbit_ai_config nao encontrada para o tenant alvo';
  END IF;

  INSERT INTO public.orbit_quarantine_backups (empresa_id, batch_label, entity_type, entity_id, snapshot)
  VALUES (v_empresa, 'commercial-v2-20260812', 'orbit_ai_config', v_cfg.id, to_jsonb(v_cfg));

  v_regras := coalesce(v_cfg.prompt_regras, '');
  v_regras := replace(v_regras, v_old_price, v_new_price);
  v_regras := replace(v_regras, v_old_card, v_new_card);
  v_regras := replace(v_regras, 'https://pay.hypercash.com.br/pt/payment-link/043ec27e-a362-4d27-82c3-f66f61b867bb',
                                 'https://link.infinitepay.io/albuquerqueadsltda/VC1D-JKIVWAm1tg-6500,00');

  UPDATE public.orbit_ai_config
     SET prompt_regras = v_regras,
         commercial_stage_v2_enabled = true,
         updated_at = now()
   WHERE id = v_cfg.id;

  IF position('hypercash' in lower(v_regras)) > 0 THEN
    RAISE EXCEPTION 'link legado ainda presente nas regras apos reconciliacao';
  END IF;
  IF position(v_new_price in v_regras) = 0 THEN
    RAISE EXCEPTION 'regra de preco nao foi atualizada (texto original divergente)';
  END IF;
END $$;