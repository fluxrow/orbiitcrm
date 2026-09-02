-- Corrige somente o template controlado da Viver que tinha duas perguntas.
-- O predicado completo torna a alteração idempotente e impede atingir outros tenants/templates.
UPDATE public.orbit_message_templates
SET
  corpo_texto = replace(
    corpo_texto,
    'Oi, {{nome}}, tudo bem? Aqui é a Fernanda, da Viver Semijoias.',
    'Oi, {{nome}}, tudo bem. Aqui é a Fernanda, da Viver Semijoias.'
  ),
  updated_at = now()
WHERE empresa_id = '36f26579-66ad-4ef1-9788-141e4c727232'::uuid
  AND nome = 'Viver - Reengajamento controlado - pedido de permissão v1'
  AND corpo_texto LIKE 'Oi, {{nome}}, tudo bem? Aqui é a Fernanda, da Viver Semijoias.%'
  AND length(corpo_texto) - length(replace(corpo_texto, '?', '')) = 2;
