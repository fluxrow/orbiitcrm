# Roadmap

## 1. Trava atômica de campanha (Viver) — em andamento
- Substituir eleição por menor ID por exclusão mútua atômica no claim do outbox.
- Migration versionada tenant-scoped com `pg_try_advisory_xact_lock`, definição anterior registrada para rollback.
- Reserva: enquanto houver campanha Viver em `processing` com lease válida, novas campanhas ficam fora do claim; lote Viver de campanha = 1.
- Execução dirigida de `campaign` não pode contornar a reserva; `ai_reply` dirigido inalterado.
- Preservar gate de 30 min, 15/dia, fail-closed e liberação de lease em falha.
- Testes: interleaving real (A antes, B com ID menor depois), IDs invertidos, lease ativo/expirado, 2 workers, lote > 1, `ai_reply` livre, outro tenant idêntico.
- Testar migration com rollback antes de aplicar via Lovable Cloud.

## 2. Novo ciclo de follow-up autorizado (Viver) — concluído
- Gate por `filtros_json.quota_policy = viver_list15_followups_separate_2026-09-11`; batches allowlisted mantidos.
- `success` sem outbox/provider deixou de contar como envio; nenhuma row antiga foi reescrita ou reativada.
- Âncora nova por (campanha, outbox) com UUID determinístico → dois ticks convergem em um único run; `UNIQUE(run_id, ordem)` antigo não colide.
- Dedupe: pendentes/running, toques aceitos reais (inclusive legados) e toques de resultado incerto.
- Os 3 motivos históricos deixaram de bloquear (sem reativação); cancelamentos legítimos seguem bloqueantes.
- `context.event_id` e `payload.event_id` usam o evento âncora real, inclusive no fallback.
- Reconciliação sem starvation: prioriza erro e cadência ausente, com rotação determinística; janela 60 candidatos / 8 execuções.
- Testes: 10 de integração com banco em memória (índices únicos reais) + 27 de decisão pura, todos verdes.
- Publicados os 7 consumidores transitivos do helper.


## Restrições permanentes
- Sem criar/enviar dados de teste em produção, sem backfill manual, sem desativar gates.
- Preservar as 53 campanhas, 12 follow-ups reparados e backups existentes.
