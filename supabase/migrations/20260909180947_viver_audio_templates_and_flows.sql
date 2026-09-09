-- Native audio templates for WhatsApp campaigns and flows.
-- The media files are immutable, public MP3 assets shipped with this release.

ALTER TABLE public.orbit_message_templates
  ADD COLUMN IF NOT EXISTS audio_url text;

ALTER TABLE public.orbit_message_templates
  DROP CONSTRAINT IF EXISTS orbit_message_templates_single_media_chk;
ALTER TABLE public.orbit_message_templates
  ADD CONSTRAINT orbit_message_templates_single_media_chk
  CHECK (NOT (audio_url IS NOT NULL AND imagem_url IS NOT NULL));

ALTER TABLE public.orbit_message_templates
  DROP CONSTRAINT IF EXISTS orbit_message_templates_audio_https_chk;
ALTER TABLE public.orbit_message_templates
  ADD CONSTRAINT orbit_message_templates_audio_https_chk
  CHECK (audio_url IS NULL OR audio_url ~ '^https://[^[:space:]]+[.]mp3([?][^[:space:]]*)?$');

COMMENT ON COLUMN public.orbit_message_templates.audio_url IS
  'Public HTTPS MP3 used as a native WhatsApp audio. Mutually exclusive with imagem_url.';

INSERT INTO public.orbit_message_templates
  (id, empresa_id, canal, nome, categoria, corpo_texto, ativo, imagem_url, audio_url)
VALUES
  (
    '5fef6b29-a669-4586-829f-64a5d76e7cf9',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 01 - Abertura - Tem estoque e quer escalar',
    'vendas',
    'Vi que você já trabalha com semijoias e tem estoque. Qual é o principal desafio para escalar?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/01-abertura-tem-estoque-quer-escalar.mp3'
  ),
  (
    '3cbb58d9-adaf-4301-9f9e-a4ad6197ea3b',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 02 - Abertura - Tem revendedoras e quer aumentar equipe',
    'vendas',
    'Vi que você já trabalha com revendedoras. Qual é o principal desafio para aumentar a equipe?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/02-abertura-tem-revendedoras-quer-aumentar-equipe.mp3'
  ),
  (
    'df29b44b-d91a-4626-97b8-6d22a59093ab',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 03 - Abertura - Vende semijoias e quer iniciar revendedoras',
    'vendas',
    'Vi que você trabalha com semijoias e quer começar uma equipe de revendedoras. Qual é seu maior desafio hoje?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/03-abertura-vende-semijoias-quer-iniciar-revendedoras.mp3'
  ),
  (
    '42fb9934-9663-4ea4-8163-523682dcdce3',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 04 - Abertura - Tentou revendedoras e não funcionou',
    'vendas',
    'Vi que você já tentou trabalhar com revendedoras. Qual foi seu maior desafio?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/04-abertura-tentou-revendedoras-nao-funcionou.mp3'
  ),
  (
    'f51fea7d-5571-4dfc-927b-0b1dea9ba690',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 05 - Convite para call individual qualificada',
    'vendas',
    'Quero entender melhor seu cenário e te direcionar de forma assertiva. Qual horário funciona melhor para a nossa conversa?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/05-convite-call-individual-qualificada.mp3'
  ),
  (
    '142341d6-7c09-4e30-8ec0-15166f1e02db',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 06 - Follow-up de call sem retorno',
    'vendas',
    'Para eu conseguir te ajudar, preciso conversar com você. Qual é o melhor dia e horário?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/06-followup-call-sem-retorno.mp3'
  ),
  (
    '049f5dbd-dc41-49d7-a02b-b7e1beaa4ac6',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 07 - Convite aula em grupo terça 19h30',
    'marketing',
    'Na terça-feira, às 19h30, teremos uma aula ao vivo. Você quer participar?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/07-convite-aula-grupo-terca-19h30.mp3'
  ),
  (
    '099885b8-6759-4666-ab8e-ba60fa29e406',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 08 - Lembrete aula no dia 19h30',
    'marketing',
    'Passando para lembrar que o ao vivo acontece hoje, às 19h30.',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/08-lembrete-aula-no-dia-19h30.mp3'
  ),
  (
    'e7a42dcc-a0bf-466e-8e8e-18b9204dae05',
    '36f26579-66ad-4ef1-9788-141e4c727232',
    'whatsapp',
    'Viver Áudio 09 - Lembrete aula 15 minutos',
    'marketing',
    'A aula começa em 15 minutos. Você consegue entrar no horário?',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/09-lembrete-aula-15-minutos.mp3'
  )
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  corpo_texto = EXCLUDED.corpo_texto,
  ativo = EXCLUDED.ativo,
  imagem_url = NULL,
  audio_url = EXCLUDED.audio_url,
  updated_at = now()
WHERE public.orbit_message_templates.empresa_id = EXCLUDED.empresa_id;

-- Keep the same named assets available to assisted/chatbot flows. Public URLs
-- are intentional here; storage_path remains null and is never treated as a
-- private-bucket path.
INSERT INTO public.orbit_audio_library
  (id, empresa_id, nome, descricao, url, storage_path, contexto, tags, duracao_ms, ativo)
VALUES
  ('5fef6b29-a669-4586-829f-64a5d76e7cf9','36f26579-66ad-4ef1-9788-141e4c727232','01 - Abertura - Tem estoque e quer escalar','Primeiro contato para quem já vende e tem estoque.','https://orbiitcrm.lovable.app/media/viver/fernanda/01-abertura-tem-estoque-quer-escalar.mp3',NULL,'apresentacao',ARRAY['fernanda','abertura','estoque'],15210,true),
  ('3cbb58d9-adaf-4301-9f9e-a4ad6197ea3b','36f26579-66ad-4ef1-9788-141e4c727232','02 - Abertura - Tem revendedoras e quer aumentar equipe','Primeiro contato para quem já tem revendedoras.','https://orbiitcrm.lovable.app/media/viver/fernanda/02-abertura-tem-revendedoras-quer-aumentar-equipe.mp3',NULL,'apresentacao',ARRAY['fernanda','abertura','revendedoras'],11490,true),
  ('df29b44b-d91a-4626-97b8-6d22a59093ab','36f26579-66ad-4ef1-9788-141e4c727232','03 - Abertura - Vende semijoias e quer iniciar revendedoras','Primeiro contato para quem quer iniciar uma equipe.','https://orbiitcrm.lovable.app/media/viver/fernanda/03-abertura-vende-semijoias-quer-iniciar-revendedoras.mp3',NULL,'apresentacao',ARRAY['fernanda','abertura','revendedoras'],12450,true),
  ('42fb9934-9663-4ea4-8163-523682dcdce3','36f26579-66ad-4ef1-9788-141e4c727232','04 - Abertura - Tentou revendedoras e não funcionou','Primeiro contato para quem tentou e não conseguiu.','https://orbiitcrm.lovable.app/media/viver/fernanda/04-abertura-tentou-revendedoras-nao-funcionou.mp3',NULL,'apresentacao',ARRAY['fernanda','abertura','revendedoras'],13770,true),
  ('f51fea7d-5571-4dfc-927b-0b1dea9ba690','36f26579-66ad-4ef1-9788-141e4c727232','05 - Convite para call individual qualificada','Convite usado somente após qualificação.','https://orbiitcrm.lovable.app/media/viver/fernanda/05-convite-call-individual-qualificada.mp3',NULL,'agendamento',ARRAY['fernanda','call','qualificada'],17350,true),
  ('142341d6-7c09-4e30-8ec0-15166f1e02db','36f26579-66ad-4ef1-9788-141e4c727232','06 - Follow-up de call sem retorno','Segundo contato de call, cancelado automaticamente se houver resposta.','https://orbiitcrm.lovable.app/media/viver/fernanda/06-followup-call-sem-retorno.mp3',NULL,'agendamento',ARRAY['fernanda','call','followup'],7950,true),
  ('049f5dbd-dc41-49d7-a02b-b7e1beaa4ac6','36f26579-66ad-4ef1-9788-141e4c727232','07 - Convite aula em grupo terça 19h30','Somente depois de consentimento e para a terça correta.','https://orbiitcrm.lovable.app/media/viver/fernanda/07-convite-aula-grupo-terca-19h30.mp3',NULL,'agendamento',ARRAY['fernanda','aula','grupo'],16690,true),
  ('099885b8-6759-4666-ab8e-ba60fa29e406','36f26579-66ad-4ef1-9788-141e4c727232','08 - Lembrete aula no dia 19h30','Somente no dia de uma aula válida.','https://orbiitcrm.lovable.app/media/viver/fernanda/08-lembrete-aula-no-dia-19h30.mp3',NULL,'agendamento',ARRAY['fernanda','aula','lembrete'],5970,true),
  ('e7a42dcc-a0bf-466e-8e8e-18b9204dae05','36f26579-66ad-4ef1-9788-141e4c727232','09 - Lembrete aula 15 minutos','Somente quinze minutos antes de uma aula válida.','https://orbiitcrm.lovable.app/media/viver/fernanda/09-lembrete-aula-15-minutos.mp3',NULL,'agendamento',ARRAY['fernanda','aula','lembrete'],14250,true)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  url = EXCLUDED.url,
  storage_path = NULL,
  contexto = EXCLUDED.contexto,
  tags = EXCLUDED.tags,
  duracao_ms = EXCLUDED.duracao_ms,
  ativo = true,
  updated_at = now()
WHERE public.orbit_audio_library.empresa_id = EXCLUDED.empresa_id;

-- The two Typebot D0 actions retain their original template_id as the pilot
-- authority key, while the executor selects the matching audio by form answer.
UPDATE public.orbit_flow_actions a
SET action_config = jsonb_set(
  jsonb_set(coalesce(a.action_config,'{}'::jsonb), '{enabled}', 'true'::jsonb, true),
  '{template_by_payload}',
  jsonb_build_object(
    'path', 'raw.momento_negocio',
    'fallback_template_id', a.action_config->>'template_id',
    'values', jsonb_build_object(
      'Já trabalho com semijoias  e tenho estoque', '5fef6b29-a669-4586-829f-64a5d76e7cf9',
      'Já trabalho com semijoias e tenho estoque', '5fef6b29-a669-4586-829f-64a5d76e7cf9',
      'Já tenho revendedoras e quero aumentar a equipe', '3cbb58d9-adaf-4301-9f9e-a4ad6197ea3b',
      'Quero começar a trabalhar com revendedoras', 'df29b44b-d91a-4626-97b8-6d22a59093ab',
      'Já tentei trabalhar com revendedoras e não deu certo', '42fb9934-9663-4ea4-8163-523682dcdce3'
    )
  ),
  true
), updated_at = now()
FROM public.orbit_flows f
WHERE a.flow_id=f.id
  AND f.empresa_id='36f26579-66ad-4ef1-9788-141e4c727232'
  AND f.nome IN ('VIVER - Baixo capital -> Aula Grupo','VIVER - Qualificado -> Call Individual')
  AND a.ordem=0
  AND a.action_type::text='send_whatsapp_template';

-- Qualified, silent leads receive two controlled audio attempts. Both stop as
-- soon as the lead replies; no compensatory backlog is created.
UPDATE public.orbit_flow_actions a
SET action_config = coalesce(a.action_config,'{}'::jsonb) || jsonb_build_object(
  'template_id','f51fea7d-5571-4dfc-927b-0b1dea9ba690',
  'enabled',true,
  'cancel_on_reply',true,
  'dry_run',false,
  'viver_controlled_followup',true,
  'pilot_not_before','2026-09-09T03:00:00Z'
), updated_at=now()
FROM public.orbit_flows f
WHERE a.flow_id=f.id
  AND f.empresa_id='36f26579-66ad-4ef1-9788-141e4c727232'
  AND f.nome='VIVER - Qualificado -> Call Individual'
  AND a.ordem=2
  AND a.delay_seconds=86400;

UPDATE public.orbit_flow_actions a
SET action_config = coalesce(a.action_config,'{}'::jsonb) || jsonb_build_object(
  'template_id','142341d6-7c09-4e30-8ec0-15166f1e02db',
  'enabled',true,
  'cancel_on_reply',true,
  'dry_run',false,
  'viver_controlled_followup',true,
  'pilot_not_before','2026-09-09T03:00:00Z'
), updated_at=now()
FROM public.orbit_flows f
WHERE a.flow_id=f.id
  AND f.empresa_id='36f26579-66ad-4ef1-9788-141e4c727232'
  AND f.nome='VIVER - Qualificado -> Call Individual'
  AND a.ordem=3
  AND a.delay_seconds=259200;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.orbit_message_templates
  WHERE empresa_id='36f26579-66ad-4ef1-9788-141e4c727232'
    AND id IN (
      '5fef6b29-a669-4586-829f-64a5d76e7cf9','3cbb58d9-adaf-4301-9f9e-a4ad6197ea3b',
      'df29b44b-d91a-4626-97b8-6d22a59093ab','42fb9934-9663-4ea4-8163-523682dcdce3',
      'f51fea7d-5571-4dfc-927b-0b1dea9ba690','142341d6-7c09-4e30-8ec0-15166f1e02db',
      '049f5dbd-dc41-49d7-a02b-b7e1beaa4ac6','099885b8-6759-4666-ab8e-ba60fa29e406',
      'e7a42dcc-a0bf-466e-8e8e-18b9204dae05'
    )
    AND ativo=true AND audio_url IS NOT NULL AND imagem_url IS NULL;
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'Viver audio setup incomplete: expected 9 templates, found %', v_count;
  END IF;
END $$;
