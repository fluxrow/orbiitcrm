ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS block_email_collection boolean NOT NULL DEFAULT false;

UPDATE public.orbit_ai_config
SET block_email_collection = true,
    updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND block_email_collection IS DISTINCT FROM true;

UPDATE public.orbit_ai_config
SET prompt_regras = COALESCE(prompt_regras, '') || E'\n\nCOLETA DE E-MAIL (PROIBIDA)\n- NUNCA peça e-mail, "e-mail principal", "melhor e-mail" ou endereço eletrônico ao lead, seja para cadastro, acesso, detalhes, inscrição, pagamento ou continuidade.\n- Toda a venda e toda a orientação continuam no WhatsApp, nesta mesma conversa.\n- O WhatsApp e os dados já presentes no prospect são suficientes; não solicite dados de contato adicionais.\n- Se o lead informar o e-mail espontaneamente, não repita nem confirme o endereço; apenas siga a conversa normalmente.\n- Notificações internas da equipe podem exibir um e-mail já existente, mas você nunca solicita e-mail ao lead.',
    updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND COALESCE(prompt_regras, '') NOT LIKE '%COLETA DE E-MAIL (PROIBIDA)%';