-- Uma participação por prospect e ocorrência da aula. O aceite explícito é
-- persistido por orbit-ai-agent em orbit_meetings.metadata; o scheduler de
-- reuniões existente emite os lembretes tenant-scoped de 24h e 5min.
--
-- Participantes de uma ocorrência específica são operação de produção
-- auditada e nunca entram em migração permanente com IDs gerados.

CREATE UNIQUE INDEX IF NOT EXISTS orbit_meetings_viver_class_occurrence_uniq
ON public.orbit_meetings (
  empresa_id,
  prospect_id,
  (metadata->>'class_occurrence_key')
)
WHERE metadata->>'meeting_kind' = 'viver_group_class';
