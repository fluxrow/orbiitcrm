# Etapa 2 — Motor de Fluxos

Objetivo: transformar a aba "Fluxos" em um motor real de automação por empresa, capaz de reagir a eventos do CRM (lead novo, mudança de etapa, inatividade, classificação da IA) e executar ações (enviar mensagem, mover de etapa, criar tarefa, ativar/desativar agente). Sem quebrar nada do que já roda.

## Princípios

- **Aditivo**: novas tabelas `orbit_flow_*`. Não altera schema de `orbit_deals`, `orbit_conversas`, `orbit_prospects`.
- **Por empresa**: tudo filtrado por `empresa_id` com RLS.
- **Opt-in**: fluxos nascem `inativo`. Sem ativação manual, nada dispara.
- **Idempotente**: cada execução tem chave única por `(flow_id, trigger_entity_id, trigger_event_id)` pra evitar duplicar.
- **Observável**: toda execução grava log com status, payload, erro.
- **Reversível**: drop das tabelas novas não afeta CRM.

## Arquitetura

```text
evento no CRM (deal movido / prospect qualificado / msg recebida)
        │
        ▼
emissor publica em orbit_flow_events (fila append-only)
        │
        ▼
orbit-flow-dispatcher (edge function, cron 1min + invoke manual)
   ├─ casa eventos com orbit_flows ativos (trigger_type compatível)
   ├─ avalia condições (JSONB simples: stage_id, segmento, valor, etc.)
   └─ cria orbit_flow_runs (status=pending) e enfileira ações
        │
        ▼
orbit-flow-executor (edge function por run)
   └─ executa orbit_flow_actions em ordem, grava resultado em orbit_flow_run_steps
```

Triggers MVP: `prospect_qualified`, `deal_stage_changed`, `deal_idle` (sem movimento há N dias), `conversa_no_reply` (sem resposta do cliente há N horas).

Ações MVP: `send_whatsapp_template`, `move_deal_stage`, `create_task`, `toggle_ai_agent` (liga/desliga IA para a conversa), `notify_vendedor`.

Condições MVP (JSONB): `pipeline_stage_id`, `segmento`, `valor_estimado_min/max`, `origem`, `dias_sem_movimento`.

## Sub-etapas

### F1 — Schema base (alta, bloqueia tudo)

Migration cria:

- `orbit_flow_templates(id, nome, descricao, categoria, definicao jsonb, is_global)` — biblioteca de templates prontos (3 sementes: "Nutrir lead frio 7d", "Lembrete pós-proposta", "Ativar IA em leads novos").
- `orbit_flows(id, empresa_id, nome, descricao, trigger_type, trigger_config jsonb, condicoes jsonb, ativo bool default false, template_id fk null, created_by, created_at, updated_at)`.
- `orbit_flow_actions(id, flow_id, ordem int, action_type, action_config jsonb, delay_seconds int default 0)`.
- `orbit_flow_events(id, empresa_id, event_type, entity_type, entity_id, payload jsonb, created_at, processed_at, processed bool default false)` — fila.
- `orbit_flow_runs(id, flow_id, event_id, entity_type, entity_id, status enum(pending/running/success/error/skipped), started_at, finished_at, error)`.
- `orbit_flow_run_steps(id, run_id, action_id, ordem, status, started_at, finished_at, output jsonb, error)`.
- Unique `(flow_id, event_id)` em `orbit_flow_runs` para idempotência.
- RLS por `empresa_id` em tudo; `service_role` total; `authenticated` só lê/escreve do próprio tenant.
- Grants completos.

**Smoke test:** inserir flow manual via SQL, listar via `select`, RLS bloqueia cross-tenant.

### F2 — Emissão de eventos a partir do CRM (alta)

- Trigger SQL `AFTER UPDATE` em `orbit_deals` (mudança de `etapa_id`) → insert em `orbit_flow_events` com `event_type='deal_stage_changed'`.
- Trigger SQL `AFTER UPDATE` em `orbit_prospects` (mudança de `status_qualificacao` para `qualificado`) → insert `event_type='prospect_qualified'`.
- Sem mudança no código JS/edge — triggers fazem tudo no banco.
- Eventos com `processed=false` ficam disponíveis para o dispatcher.

**Smoke test:** mover um deal de etapa via UI; conferir `select * from orbit_flow_events order by created_at desc limit 1` retorna o evento.

### F3 — Dispatcher + Executor (alta)

- Edge function `orbit-flow-dispatcher`:
  - Lê `orbit_flow_events where processed=false limit 100`.
  - Para cada evento, busca `orbit_flows where ativo=true and empresa_id=evento.empresa_id and trigger_type=evento.event_type`.
  - Avalia condições (helper `matchesConditions(flow.condicoes, evento.payload)`).
  - Cria `orbit_flow_runs(status='pending')`, marca evento `processed=true`.
  - Invoca `orbit-flow-executor` por run (fire-and-forget).
- Edge function `orbit-flow-executor`:
  - Recebe `run_id`, marca `running`.
  - Executa actions em ordem; cada uma vira `orbit_flow_run_step`.
  - Handlers por `action_type` (case/switch), todos retornam `{ok, output, error}`.
  - Marca run `success` ou `error`.
- Cron `pg_cron` a cada 1 min invoca o dispatcher (pg_net).

**Smoke test:** criar flow "ao mover para Qualificação, criar tarefa para vendedor", mover deal, ver tarefa criada em até 1min e `flow_run.status='success'`.

### F4 — Action handlers MVP (alta)

Implementar dentro do executor:

- `send_whatsapp_template`: usa `orbit-send-message` existente, com `template_id` do `orbit_message_templates`.
- `move_deal_stage`: `update orbit_deals set etapa_id=...`.
- `create_task`: insert `orbit_tasks`.
- `toggle_ai_agent`: `update orbit_conversas set human_talk=...` (true desliga IA, false reativa).
- `notify_vendedor`: invoca `send-vendedor-notification` existente.

Cada handler valida config e retorna erro estruturado. Sem retry automático no MVP.

**Smoke test:** flow com 3 ações em sequência, ver 3 `run_steps` com `status=success`.

### F5 — UI de Fluxos em Configurações (média)

Substitui placeholder atual da aba Fluxos por:

- Lista de fluxos (nome, trigger, status ativo/inativo, último run, ações).
- Botão "Novo Fluxo" abre wizard de 3 passos:
  1. Escolher template ou começar em branco.
  2. Configurar trigger + condições (formulário guiado por `trigger_type`).
  3. Adicionar ações em sequência (drag não — só ordem com setas pra cima/baixo).
- Toggle ativar/desativar inline.
- Modal "Histórico" mostra últimas 20 runs com status e steps expansíveis.
- Hook `useOrbitFlows`, `useOrbitFlowRuns(flow_id)`, `useOrbitFlowTemplates`.

**Smoke test:** criar flow do template "Nutrir lead frio 7d", ativar, conferir aparece na lista; abrir histórico vazio sem erro.

### F6 — Integração com Agente IA + smoke tests automatizados (média)

- No `orbit-ai-agent`: ao classificar prospect como `qualificado`, além do `ensure_deal_for_prospect` (já feito na 1.5), inserir evento `prospect_qualified` em `orbit_flow_events` (redundante com trigger SQL, mas garante mesmo se o status já estava qualificado e só re-classificou — usar `event_dedupe_key`).
- Ação `toggle_ai_agent` permite que cliente configure: "quando deal entrar em Proposta, desligar IA" ou "quando entrar em Novo Lead, ligar IA".
- Estender `scripts/smoke/etapa-1-5.sh` com etapa-2:
  - Cria flow programaticamente.
  - Insere evento sintético.
  - Aguarda dispatcher.
  - Assert run criado e bem-sucedido.

**Smoke test final:** rodar `scripts/smoke/etapa-2.sh` → 6/6 asserts verdes.

## Ordem de execução

F1 → F2 → F3 → F4 → F5 → F6. Cada uma é commit isolado e reversível. Posso pausar entre cada para você validar.

## Detalhes técnicos

- Cron: `pg_cron` + `pg_net` para invocar o dispatcher a cada minuto. SQL via `supabase--insert` (não migration, contém URL/anon key).
- `verify_jwt = false` nas duas edge functions novas; validação interna via `service_role`.
- Limite anti-loop: max 50 runs por flow por hora por entidade (check no dispatcher).
- Soft-delete de flow: `deleted_at` em `orbit_flows`, filtrado nas queries.

## Riscos e mitigação

- **Loop infinito**: ação `move_deal_stage` dispara trigger `deal_stage_changed` que pode reativar o mesmo flow. Mitigação: dispatcher ignora eventos cujo `payload.triggered_by_flow_id` está setado.
- **Custo de execução**: dispatcher só roda se houver eventos pendentes (`limit 0` retorna cedo).
- **Templates errados**: sementes em `is_global=true` viram clones por empresa quando escolhidos no wizard.

## O que NÃO entra nesta etapa

- Editor visual de fluxo (drag-and-drop estilo n8n) — fica para Etapa 3.
- Branching condicional (if/else dentro do fluxo) — MVP é linear.
- Webhook externo como trigger — Etapa 4.

Confirma para eu começar pela **F1 (schema base)**?
