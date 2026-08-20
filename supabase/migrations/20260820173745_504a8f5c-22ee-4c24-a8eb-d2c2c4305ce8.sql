-- 1) Snapshot auditável (antes de qualquer mutação)
INSERT INTO public.orbit_quarantine_backups (empresa_id, batch_label, entity_type, entity_id, snapshot)
SELECT c.empresa_id, 'bullink-remove-false-benefits-20260820', 'orbit_ai_config', c.id, to_jsonb(c)
FROM public.orbit_ai_config c
WHERE c.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';

-- 2) Nova flag tenant-scoped, default OFF
ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS false_benefits_guard jsonb;

-- 3) Correção textual dos prompts (somente Bullink)
UPDATE public.orbit_ai_config
SET prompt_regras = replace(
      prompt_regras,
      '- Inclui mineração de referências de alto clique, títulos, roteiros de alta retenção, análise de métricas, grupo de WhatsApp e IA especialista em algoritmo do YouTube/Canal Dark como apoio técnico.',
      '- Inclui mineração de referências de alto clique, títulos, roteiros de alta retenção e análise de métricas.'
    ) || E'\n\nENTREGÁVEIS (VERDADE ABSOLUTA, MAIOR PESO)\n'
      || E'- NUNCA invente benefícios, bônus, ferramentas ou suportes. Descreva somente os entregáveis oficialmente confirmados nestas instruções.\n'
      || E'- A oferta NÃO inclui acesso a nenhuma IA, ferramenta de IA, agente ou "IA especialista em algoritmo". Nunca prometa, ofereça ou insinue esse acesso como incluso, bônus ou apoio ao cliente.\n'
      || E'- A oferta NÃO inclui grupo, grupo de WhatsApp, comunidade, mentoria em grupo nem suporte em grupo. Nunca prometa ou insinue esses itens.\n'
      || E'- Se o lead perguntar sobre IA entregue ou grupo/comunidade, responda de forma curta e honesta que isso não faz parte da oferta e redirecione para os 3 meses de acompanhamento direto e individual comigo, os nichos validados, os idiomas de atuação, a estrutura de validação, mineração de referências, títulos, roteiros de alta retenção e análise de métricas.\n'
      || E'- É permitido explicar tecnicamente que o método usa IA na produção de canais, desde que sem prometer acesso a qualquer ferramenta.\n',
    prompt_roteiro = replace(
      replace(
        prompt_roteiro,
        E'- Há suporte continuado em grupo de WhatsApp para acompanhamento direto.\n',
        ''
      ),
      E'- O mentorado também tem acesso a uma IA especialista em algoritmo do YouTube e Canal Dark, usada como ferramenta de apoio técnico. A IA apoia a execução; não substitui estratégia, análise e consistência.\n',
      ''
    ),
    false_benefits_guard = jsonb_build_object('enabled', true),
    updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';