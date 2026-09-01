# Remediador ORBIT por playbooks

O monitor `monitor-qualidade-bullink-e-viver` permanece read-only. O remediador é uma superfície separada, com fila, lease e aprovação por classe escopada ao tenant. Aprovar uma classe após canário evita aprovação por ocorrência; qualquer evidência ambígua continua fail-closed.

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

## Modelo operacional sem aprovação por ocorrência

O monitor somente produz `SanitizedIncidentDescriptor`; a fila `orbit_remediation_incidents` faz o handoff persistente. O worker adquire lease, valida idempotência e consome apenas descritores allowlisted. Notificações ficam fora do worker.

| Classe | Aprovação | Automático após ativação/canário |
|---|---|---|
| follow-up | única por classe | preflight, lease transitório, correção reversível e release no vencimento |
| meeting_confirmation | única por classe | mesmas condições, com consentimento e reunião futura |
| meeting_reminder (24h/1h/5m/semanal) | única por classe | somente antes da janela, conteúdo/link/template idênticos e outbox ausente |
| edge_deploy_drift | por ocorrência | nunca automático por padrão; exige SHA/runtime, quality gate e rollback |

Qualquer divergência, janela vencida, reunião iniciada/encerrada, opt-out, handoff, dúvida de aceite do provedor, duplicidade ou cross-tenant muda o estado para `needs_approval`/`expired` e alerta Cauã. A liberação só usa o outbox oficial, exatamente uma vez, com `attempts=1` e `provider_message_id`; nunca chama o provedor diretamente.

Ativação segura: migration revisada → canário em tenant de teste → aprovar classe e registrar `canary_run_id` → habilitar worker em modo dry-run → observar → habilitar release. Rollback: pausar worker, expirar leases, restaurar snapshot operacional e manter mensagens vencidas sem compensação.

## Executor `orbit-remediation-tick`

- Autenticação exclusiva por `SCHEDULER_CRON_TOKEN`; nenhum cliente recebe acesso.
- Preflight de follow-up entre T-15 e T-5 minutos. O item agendado, tenant, conversa, destinatário, template e conteúdo são fingerprinted com SHA-256; telefone, mensagem e URL nunca entram na fila.
- Preflight de lembretes 24h/1h entre T-20 e T-10 minutos e de 5min entre T-12 e T-8 minutos. Reunião, consentimento operacional, fluxo ativo, template e link canônico são revalidados novamente no release.
- `shadow` apenas registra a evidência e para. `auto_release` só pode ser habilitado uma vez por tenant/classe depois de canário bem-sucedido.
- No vencimento, o worker dá um único kick no scheduler oficial (`orbit-flow-scheduler-tick` ou `orbit-meeting-scheduler`). Ele não insere outbox nem chama Z-API.
- A confirmação é assíncrona: o worker procura o outbox canônico pela correlação oficial e só fecha como `released` com `sent`, `provider_message_id` e uma tentativa. Sem outbox imediato fica `enqueued`; não confunde enqueue com envio.
- Provider ambíguo, segunda tentativa, duplicidade ou deadline vencido nunca disparam novo kick e exigem revisão.

O lembrete semanal usa a mesma ocorrência autoritativa em `orbit_meetings`; quando o fluxo ativo é um reminder 24h/1h/5m ele entra no preflight correspondente. Não existe um emissor semanal paralelo nem conteúdo reconstruído pelo remediador.

`meeting_confirmation` permanece cadastrado por classe, porém sua ativação automática depende de canário específico da correlação `consent_message_id`. O worker geral não tenta reconstruir aceite nem link; isso evita transformar resposta ambígua em autorização.
