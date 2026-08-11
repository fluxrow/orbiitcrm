# Auditoria somente-leitura — Viver Semijoias (36f26579-66ad-4ef1-9788-141e4c727232)

Nenhum código, dado ou configuração foi alterado. Nenhuma chamada Z-API foi feita.

## Estado atual (Lovable Cloud, consultado agora)

- `orbit_zapi_config` (id 665b6b41…): `ativo = false`, `envio_real_liberado = false`, instância preenchida (`Viver Semijoais`), `canary_phone_numbers` = vazio (0).
- `orbit_whatsapp_sending_config`: `enabled = true`, `outbox_adapter_enabled = true`, `daily_limit = 50`, `max_per_minute = 2`, `warmup_enabled = true` (início 2026-08-03), lote 10 / pausa 60s.
- `orbit_whatsapp_outbox`: 1222 `sent` (último em 2026-08-07), 25 `failed`. **Zero** itens em `queued`/`pending`/`processing`/`scheduled`.
- Todos os 25 `failed` têm o mesmo `last_error`: "Envio real via Z-API bloqueado para este tenant…" (o mais recente em 2026-08-11 12:13Z) — prova de que o kill switch está atuando hoje.
- `orbit_flow_scheduled_actions`: 162 `pending` (69 `send_whatsapp_template`, 93 `create_task`), janela 2026-08-11 13:45Z → 2026-08-25 11:53Z; 486 `success`; 232 `canceled`.
- Campanhas: apenas 1 campanha WhatsApp, status `concluida` — nenhuma `agendada`, `aprovada_para_envio`, `enviando` ou `pausada_por_limite`. Logo o scheduler de campanhas não tem nada para retomar neste tenant.

## 1) Caminhos que fazem fetch para endpoints de ENVIO Z-API

Gate único e fail-closed: `getOrbitZapiRealSendBlockReason()` em `_shared/orbit-zapi.ts` — bloqueia salvo `envio_real_liberado === true`; se a coluna vier nula/ausente, assume `false`.

| Caminho | Endpoint | Checa `envio_real_liberado` antes do fetch | Checa `ativo` |
| --- | --- | --- | --- |
| `orbit-whatsapp-outbox-tick` (worker) | send-text/image/audio/document/video | Sim (fail-closed, audita e marca `failed`) | Não |
| `orbit-flow-executor` → `sendZapi()` | send-text/image/audio/document/video | Sim (fail-closed + auditoria) | Não |
| `orbit-ai-agent` — resposta do agente | send-text | Sim, **com exceção canary** (ver item 4) | Não |
| `orbit-ai-agent` — áudio/TTS | send-audio | Sim | Não |
| `orbit-ai-agent` — notificação vendedor / handoff | send-text | Sim | Não |
| `orbit-send-message` (manual) | send-* | Sim | Não |
| `send-orbit-campaign` | send-text/image | Sim | Não |
| `send-vendedor-notification` | send-text | Sim | Não |
| `request-campaign-approval` | send-text | Sim | Não |
| `orbit-validate-whatsapp` | `phone-exists` + status da instância (não envia) | n/a | Não |
| `orbit-migrate-phones` | `phone-exists` + status da instância (não envia) | n/a | Não |

Conclusão: **todos** os caminhos de envio real passam pelo mesmo gate `envio_real_liberado`. **Nenhum** deles exige `ativo = true` — `ativo` não é gate de envio. A RPC `get_orbit_zapi_runtime_config` retorna as credenciais independentemente de `ativo`. Ou seja: manter `ativo = false` **não** é proteção; a proteção real é `envio_real_liberado = false`.

## 2) Toggle de Configurações

- UI: `src/pages/orbit/ConfigPage.tsx` (linha ~883) altera somente `zapiForm.ativo`, persistido via `useUpdateZAPIConfig` → RPC `upsert_orbit_zapi_config_secure(p_ativo)`.
- A RPC grava apenas `nome_instancia, instance_id, numero_origem, webhook_url, notificar_enviadas_por_mim, ativo` + tokens no Vault. **Não existe parâmetro para `envio_real_liberado`** — salvar/conectar/validar a instância nunca liga o envio real implicitamente.
- `orbit-validate-whatsapp` e `orbit-migrate-phones` só leem a config (checam conexão via status da instância e `phone-exists`); não escrevem em `ativo` nem em `envio_real_liberado`.
- `orbit-webhook` lê `orbit_zapi_config` para resolver `empresa_id` (por `instance_id` e, no fallback, `ativo=true`); não escreve na config.
- Efeito colateral relevante de conectar: mensagens recebidas passam a chegar no webhook e a acionar o agente (o webhook resolve o tenant por `instance_id`, mesmo com `ativo=false`). As respostas do agente serão barradas pelo kill switch e gravadas como OUT `falhou`.

## 3) Cron/workers ativos e o primeiro tick após conectar

Jobs ativos: `orbit-whatsapp-outbox-tick-1min`, `orbit-flow-dispatcher-1min`, `orbit-flow-scheduler-tick-1min`, `orbit-campaign-scheduler-tick`, `orbit-meeting-scheduler` (10min), `orbit-advisor-scan-hourly`.

No primeiro tick após conectar a instância (mantendo `envio_real_liberado=false`):

1. `orbit-flow-scheduler-tick` reclama as ações vencidas dos 162 pending; as 93 `create_task` executam normalmente (não tocam WhatsApp).
2. As `send_whatsapp_template` vencidas vão para o outbox (o tenant tem `outbox_adapter_enabled=true`), entrando como `queued`.
3. `orbit-whatsapp-outbox-tick` consome, revalida elegibilidade e **falha fail-closed** no gate `envio_real_liberado`: item vira `failed` com `ZAPI_REAL_SEND_BLOCKED`, linha de auditoria em `orbit_zapi_send_audit` e mensagem visual `falhou`. Zero fetch para a Z-API.
4. `orbit-campaign-scheduler-tick`: nada a fazer (nenhuma campanha agendada/pausada/enviando).

Resultado esperado: **nenhuma mensagem sai**, mas há ruído — até 69 itens marcados como `failed` e OUT `falhou` visíveis nas conversas (é exatamente o padrão dos 25 `failed` atuais). Nenhum disparo em massa é possível enquanto o kill switch estiver `false`.

## 4) `canary_phone_numbers` vazio

- Único consumidor: `orbit-ai-agent` (resposta ao lead). Com `envio_real_liberado=false`, ele libera o envio **apenas** se o telefone do lead estiver em `canary_phone_numbers`. Para a Viver a lista está vazia → nenhuma exceção; todas as respostas ficam bloqueadas.
- Se `envio_real_liberado` virar `true`, a allowlist deixa de ter qualquer efeito restritivo (ela é só bypass do bloqueio, não whitelist de destino): todos os caminhos — agente, follow-ups de fluxo, campanhas, manual — passam a enviar de verdade, limitados apenas por ritmo/cota (`daily_limit=50`, `2/min`, warmup) e pelas regras de elegibilidade do outbox. É por isso que virar esse flag agora seria arriscado com 69 templates agendados.

## 5) RLS / isolamento por `empresa_id`

- `orbit_whatsapp_outbox`: apenas `SELECT` para `authenticated` no próprio tenant; escrita só por `service_role`.
- `orbit_flow_scheduled_actions`: apenas `SELECT` por `empresa_id`.
- `orbit_whatsapp_sending_config` e `orbit_zapi_config`: leitura/gestão por super-admin ou admin do próprio tenant.
- Edge Functions de envio derivam `empresa_id` do servidor (perfil do chamador ou registro), não confiam no cliente; `orbit-validate-whatsapp` e `orbit-migrate-phones` validam o tenant do chamador antes de tocar prospects.
- Ponto de atenção (não bloqueante): a policy `Orbit admins can manage own empresa zapi_config` é `ALL`, então um admin do próprio tenant consegue, via API de dados, escrever `envio_real_liberado = true` diretamente — o kill switch não é exclusivo de super-admin. Vale considerar um trigger/coluna protegida em fase futura.

## 6) Veredito

**GO** para apenas conectar/validar a instância Z-API agora, mantendo `ativo = false` e `envio_real_liberado = false`.

Justificativa: os 100% dos caminhos de envio real passam pelo gate `envio_real_liberado` fail-closed; não há itens de outbox pendentes; não há campanha em estado retomável; a allowlist canary está vazia; conectar/validar não altera nenhum dos dois flags. Não recomendo liberar envio real nesta etapa.

Condições para o GO:
- Não usar "Aprovar disparo" nem criar/reativar campanhas.
- Aceitar que até 69 ações agendadas de WhatsApp serão marcadas `failed` (ruído em conversas). Se esse ruído não for aceitável, o passo anterior seria cancelar/reagendar essas ações pendentes — mas isso é alteração de dados e está fora deste escopo somente-leitura.
- Não popular `canary_phone_numbers` sem decisão explícita.
