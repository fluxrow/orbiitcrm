# Remediador ORBIT por playbooks

O monitor `monitor-qualidade-bullink-e-viver` permanece read-only. O remediador é uma superfície separada, acionada por uma tarefa autorizada, e não deve ser publicado/ativado automaticamente por este commit.

## Contrato de segurança

- Playbooks fechados: `edge_function_deploy_drift` e `meeting_reminder_source_guard`.
- Tenant e função são allowlists no código; não existe SQL arbitrário, nome de função livre ou deploy genérico.
- Toda execução exige `idempotencyKey`, precondições, janela temporal e snapshot sanitizado antes/depois.
- `dryRun=true` é o padrão e não chama o adaptador de deploy.
- Médio/alto risco exige `approvedBy`; nenhum playbook pode reenviar mensagem, reabrir ocorrência, trocar destinatário, conteúdo, consentimento ou elegibilidade.
- Depois do deploy isolado, o SHA/runtime esperado é rechecado e os contadores de replay/outbox precisam permanecer inalterados. Divergência aciona rollback.
- O ledger `orbit_remediation_runs` tem chave idempotente, RLS de leitura por tenant e escrita somente por `service_role`.

## Playbooks

### Drift de Edge Function

Compara o SHA/runtime esperado com o publicado, executa o quality gate fora do remediador, publica apenas a função allowlisted e valida que não houve replay ou criação de outbox. É risco alto: requer aprovação humana.

### Guard de lembrete

Fixa `meeting_reminder_24h`, `meeting_reminder_1h` e `meeting_reminder_5m` em `meeting_confirmation` na função `orbit-flow-executor`. A validação rejeita ocorrência vencida (`occurrence_expired_no_reopen`) e nunca reprocessa runs antigos.

## Fluxo operacional

1. Gerar snapshot/preview em dry-run.
2. Conferir SHA, runtime, função, tenant, janela e contadores de entrega.
3. Obter aprovação humana para risco médio/alto.
4. Executar publicação isolada via adaptador específico.
5. Revalidar SHA/runtime e evidência de entrega; fazer rollback se falhar.
6. Persistir auditoria sanitizada e entregar relatório.

## Validação local

```bash
npx --yes deno test supabase/functions/_shared/remediation-playbooks_test.ts
npx --yes deno check supabase/functions/_shared/remediation-playbooks.ts
npx --yes deno test supabase/functions/orbit-flow-executor/outbox-source_test.ts supabase/functions/_shared/meeting-reminder-policy_test.ts supabase/functions/_shared/viver-meeting-lifecycle_test.ts
```

Esta implementação não executa remediação em produção e a migration deve passar por revisão de segurança antes de qualquer aplicação.
