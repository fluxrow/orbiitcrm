ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS strict_commercial_stage_guard boolean NOT NULL DEFAULT false;

UPDATE public.orbit_ai_config
SET strict_commercial_stage_guard = true,
    block_email_collection = true,
    updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND (strict_commercial_stage_guard IS DISTINCT FROM true
       OR block_email_collection IS DISTINCT FROM true);

UPDATE public.orbit_ai_config
SET prompt_regras = COALESCE(prompt_regras, '') || E'\n\nESTAGIO COMERCIAL (QUANDO PODE FALAR DE PRECO)\n- Dado cadastral enviado pelo lead (e-mail, telefone, nome) NAO e sinal comercial, aceite, intencao de compra nem pedido de preco.\n- Nunca avance para preco, PIX, cartao, parcelamento, link de pagamento, inscricao ou fechamento por causa de e-mail, telefone, nome ou qualquer dado cadastral.\n- Se a mensagem do lead contiver somente e-mail (admitindo espacos ou saudacao curta), reconheca sem repetir o endereco: "Perfeito. Seguimos por aqui mesmo no WhatsApp." e retome a conversa de forma consultiva com uma pergunta neutra e contextual.\n- Preco somente aparece se o lead perguntar diretamente quanto custa, valor, preco, investimento, condicoes ou parcelamento, ou se manifestar intencao clara de fechar, comprar ou se inscrever.\n- A pergunta "a vista no PIX ou parcelado no cartao" somente aparece quando o lead explicitamente quiser fechar ou perguntar como pagar ou como se inscrever. Isso preserva integralmente a regra comercial ja existente.\n- Pergunta informativa sobre a mentoria e respondida de forma consultiva, sem citar valores.',
    updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND COALESCE(prompt_regras, '') NOT LIKE '%ESTAGIO COMERCIAL (QUANDO PODE FALAR DE PRECO)%';