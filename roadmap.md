# Roadmap

## 1. Trava atômica de campanha (Viver) — em andamento
- Substituir eleição por menor ID por exclusão mútua atômica no claim do outbox.
- Migration versionada tenant-scoped com `pg_try_advisory_xact_lock`, definição anterior registrada para rollback.
- Reserva: enquanto houver campanha Viver em `processing` com lease válida, novas campanhas ficam fora do claim; lote Viver de campanha = 1.
- Execução dirigida de `campaign` não pode contornar a reserva; `ai_reply` dirigido inalterado.
- Preservar gate de 30 min, 15/dia, fail-closed e liberação de lease em falha.
- Testes: interleaving real (A antes, B com ID menor depois), IDs invertidos, lease ativo/expirado, 2 workers, lote > 1, `ai_reply` livre, outro tenant idêntico.
- Testar migration com rollback antes de aplicar via Lovable Cloud.

## 2. Novo ciclo de follow-up autorizado (Viver) — pendente
- Novo ciclo somente após `campaign` real da programação `viver_list15_followups_separate_2026-09-11` (2 batches allowlisted mantidos).
- Não ressuscitar rows antigas; `success` sem outbox/provider não conta como envio, mas histórico não é reescrito.
- Âncora nova auditável e idempotente por campanha/outbox, com ID determinístico/unicidade real, evitando colisão com `UNIQUE(run_id, ordem)` antigo.
- Dedupe conta pendentes/running e envio aceito real, incluindo toques legados aceitos.
- Somente os 3 motivos históricos (`qr_reconnect_safety_no_backfill`, `pre_go_live_dry_run_queue_quarantined`, `pre_zapi_reconnect_safety_reset_2026_08_18`) são desconsiderados no novo ciclo, sem reativação.
- Cancelamentos por resposta, opt-out, humano, reunião, manual e número inválido seguem bloqueantes.
- `context.event_id`/payload usam o evento âncora real, inclusive no fallback.
- Corrigir starvation da reconciliação: priorizar candidatos faltantes/com erro em vez de sempre os 5 mais recentes.
- Fixture realista com `success` sem envio em todas as ordens e demais casos positivos/negativos.
- Publicar todos os consumidores atuais do helper (executor, outbox-pilot e demais), não apenas duas funções.

## Restrições permanentes
- Sem criar/enviar dados de teste em produção, sem backfill manual, sem desativar gates.
- Preservar as 53 campanhas, 12 follow-ups reparados e backups existentes.
