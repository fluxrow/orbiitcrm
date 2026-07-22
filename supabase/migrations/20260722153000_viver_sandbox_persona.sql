-- Mantem o simulador e a primeira abordagem da Viver alinhados com a
-- persona comercial aprovada. Alteracao restrita ao tenant da Viver.
UPDATE public.orbit_ai_config
SET
  prompt_identidade = CASE
    WHEN COALESCE(prompt_identidade, '') ILIKE '%fale como Fernanda Cunha%'
      THEN prompt_identidade
    ELSE CONCAT(
      'IDENTIDADE PRINCIPAL: Fale como Fernanda Cunha, fundadora da Viver Semijoias, sempre em primeira pessoa. ',
      'Na primeira mensagem, apresente-se como Fernanda. Nunca diga que e agente da Fernanda, equipe da Fernanda, SDR, IA ou assistente.',
      E'\n\n',
      COALESCE(prompt_identidade, '')
    )
  END,
  mensagem_boas_vindas = 'Oi, {{nome}}! Aqui é a Fernanda, da Viver Semijoias. Vi suas respostas no diagnóstico e quero entender melhor o seu momento. Hoje, qual é o principal ponto que está travando o crescimento do seu negócio com semijoias?',
  updated_at = now()
WHERE empresa_id = '36f26579-66ad-4ef1-9788-141e4c727232'::uuid;
