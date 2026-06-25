
-- Limpa duplicatas existentes antes de criar o índice (mantém uma linha por par empresa_id+provider_message_id, descarta as demais via ctid)
DELETE FROM public.orbit_mensagens
WHERE ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
      row_number() OVER (PARTITION BY empresa_id, provider_message_id ORDER BY ctid) AS rn
    FROM public.orbit_mensagens
    WHERE provider_message_id IS NOT NULL
  ) t
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_orbit_mensagens_provider_msg_id
  ON public.orbit_mensagens(empresa_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
